import type {
    ISourceService,
    FictionDetails,
    ChapterMeta,
    ChapterContent,
} from '@/core/interfaces/ISourceService'

const BASE_URL = 'https://www.royalroad.com'
const CDN_URL = 'https://www.royalroadcdn.com'
const FICTION_REGEX = /royalroad\.com\/fiction\/(\d+)\/([\w-]+)/

export class RoyalRoadService implements ISourceService {
    readonly sourceId = 'royalroad'
    readonly sourceName = 'Royal Road'

    // ── URL helpers ────────────────────────────────────────────────────────────

    normalizeFictionUrl(input: string): string | null {
        const m = input.match(FICTION_REGEX)
        if (!m) return null
        return `${BASE_URL}/fiction/${m[1]}/${m[2]}`
    }

    private parseIds(fictionUrl: string): { fictionId: string; slug: string } | null {
        const m = fictionUrl.match(FICTION_REGEX)
        if (!m) return null
        return { fictionId: m[1], slug: m[2] }
    }

    buildCoverUrl(fictionId: string, slug: string): string {
        return `${CDN_URL}/public/covers-large/${fictionId}-${slug}.jpg`
    }

    // ── HTTP + DOM ─────────────────────────────────────────────────────────────

    /** Tente d'abord un fetch direct, bascule sur corsproxy.io si le navigateur bloque le CORS. */
    private async fetchDoc(url: string, attempt = 1): Promise<Document> {
        let html: string

        try {
            const res = await fetch(url, { credentials: 'omit', mode: 'cors' })
            if (res.status === 429) {
                if (attempt <= 3) {
                    await new Promise(r => setTimeout(r, 2000 * attempt))
                    return this.fetchDoc(url, attempt + 1)
                }
                throw new Error(`Fetch échoué [429] : ${url}`)
            }
            if (!res.ok) throw new Error(`Royal Road a répondu [${res.status}] : ${url}`)
            html = await res.text()
        } catch (e: unknown) {
            if (e instanceof Error && (e.message.startsWith('Fetch échoué') || e.message.startsWith('Royal Road a répondu'))) throw e
            // Royal Road bloque le CORS navigateur; les proxys publics peuvent être temporairement bloqués.
            const proxies = [
                `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
                `https://corsproxy.org/?${encodeURIComponent(url)}`,
            ]
            for (const proxied of proxies) {
                try {
                    const res = await fetch(proxied)
                    if (res.status === 429) {
                        if (attempt <= 3) {
                            await new Promise(r => setTimeout(r, 2000 * attempt))
                            return this.fetchDoc(url, attempt + 1)
                        }
                        throw new Error(`Fetch échoué [429] : ${url}`)
                    }
                    if (res.ok) {
                        html = await res.text()
                        return new DOMParser().parseFromString(html, 'text/html')
                    }
                } catch (proxyError) {
                    if (proxyError instanceof Error && proxyError.message.startsWith('Fetch échoué')) throw proxyError
                }
            }
            throw new Error(`Fetch échoué via les proxys CORS : ${url}`)
        }

        return new DOMParser().parseFromString(html, 'text/html')
    }

    // ── ISourceService ─────────────────────────────────────────────────────────

    async getFictionDetails(fictionUrl: string): Promise<FictionDetails> {
        const ids = this.parseIds(fictionUrl)
        if (!ids) throw new Error('URL RoyalRoad non valide')

        const doc = await this.fetchDoc(fictionUrl)

        const title = doc.querySelector('h1')?.textContent?.trim() ?? 'Sans titre'
        const author = doc.querySelector('h4 a[href^="/profile/"]')?.textContent?.trim() ?? 'Inconnu'
        const description = doc.querySelector('.description')?.innerHTML ?? ''
        const tags = Array.from(doc.querySelectorAll('.tags a'))
            .map(a => a.textContent?.trim() ?? '')
            .filter(Boolean)

        // Vrai URL de couverture depuis og:image (inclut le ?time= requis)
        const ogImage = doc
            .querySelector<HTMLMetaElement>('meta[property="og:image"]')
            ?.getAttribute('content') ?? ''
        const coverUrl = ogImage || this.buildCoverUrl(ids.fictionId, ids.slug)

        const rows = doc.querySelectorAll('#chapters table tbody tr')

        return {
            fictionId: ids.fictionId,
            slug: ids.slug,
            title,
            author,
            description,
            tags,
            coverUrl,
            url: fictionUrl,
            totalChapters: rows.length,
        }
    }

    async getChapterList(fictionUrl: string, onProgress?: (found: number, page: number) => void): Promise<ChapterMeta[]> {
        const chapters: ChapterMeta[] = []
        let page = 1
        let hasMore = true

        while (hasMore) {
            const url = page === 1 ? fictionUrl : `${fictionUrl}?page=${page}`
            const doc = await this.fetchDoc(url)

            // Sélecteur flexible : toutes les <a> pointant vers un chapitre dans la TOC
            const links = Array.from(
                doc.querySelectorAll<HTMLAnchorElement>('a[href*="/chapter/"]')
            ).filter(a => /\/chapter\/\d+\/[\w-]+/.test(a.getAttribute('href') ?? ''))

            if (links.length === 0) break

            links.forEach((link, i) => {
                const href = link.getAttribute('href') ?? ''
                const cm = href.match(/\/chapter\/(\d+)\/([\w-]+)/)
                if (!cm) return
                // Éviter les doublons (prev/next links dans le reader)
                if (chapters.some(c => c.chapterId === cm[1])) return
                // Date : chercher un <time> dans le parent <tr> le cas échéant
                const row = link.closest('tr')
                const datetime = row?.querySelector('time')?.getAttribute('datetime') ?? ''
                chapters.push({
                    chapterId: cm[1],
                    slug: cm[2],
                    title: link.textContent?.trim() ?? '',
                    url: `${BASE_URL}${href}`,
                    publishedAt: datetime,
                    order: (page - 1) * 100 + i,
                })
            })

            onProgress?.(chapters.length, page)

            // Vérifier si une vraie page suivante existe dans la pagination
            const nextLink = doc.querySelector(
                'ul.pagination li.next:not(.disabled) a, ul.pagination a[aria-label="Next"], ul.pagination a[rel="next"]'
            )
            hasMore = nextLink !== null && page < 200
            page++

            // Pause pour éviter le rate-limiting (429)
            if (hasMore) await new Promise(r => setTimeout(r, 600))
        }

        return chapters
    }

    async getChapterContent(chapterUrl: string): Promise<ChapterContent> {
        const doc = await this.fetchDoc(chapterUrl)

        const title = doc.querySelector('h1')?.textContent?.trim() ?? ''
        const contentEl = doc.querySelector('.chapter-inner')
        if (!contentEl) throw new Error('Contenu du chapitre introuvable')

        // Supprimer les publicités
        contentEl.querySelectorAll('.advert, [class*="advert"], .ad-container').forEach(el => el.remove())
        const html = contentEl.innerHTML

        const chapterMatch = chapterUrl.match(/\/chapter\/(\d+)\//)

        const prevEl = (doc.querySelector('a[rel="prev"]')
            ?? Array.from(doc.querySelectorAll('a[href*="/chapter/"]'))
                .find(a => a.textContent?.toLowerCase().includes('previous'))) as HTMLAnchorElement | undefined

        const nextEl = (doc.querySelector('a[rel="next"]')
            ?? Array.from(doc.querySelectorAll('a[href*="/chapter/"]'))
                .find(a => a.textContent?.toLowerCase().includes('next chapter'))) as HTMLAnchorElement | undefined

        return {
            chapterId: chapterMatch?.[1] ?? '',
            title,
            html,
            prevUrl: prevEl?.href ? new URL(prevEl.href, BASE_URL).href : undefined,
            nextUrl: nextEl?.href ? new URL(nextEl.href, BASE_URL).href : undefined,
        }
    }

    async checkNewChapters(fictionUrl: string, lastKnownChapterId: string): Promise<ChapterMeta[]> {
        const doc = await this.fetchDoc(fictionUrl)
        const rows = Array.from(doc.querySelectorAll('#chapters table tbody tr'))
        const newChapters: ChapterMeta[] = []

        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i]
            const link = row.querySelector('td:first-child a') as HTMLAnchorElement | null
            if (!link) continue
            const href = link.getAttribute('href') ?? ''
            const cm = href.match(/\/chapter\/(\d+)\/([\w-]+)/)
            if (!cm) continue
            if (cm[1] === lastKnownChapterId) break
            const datetime = row.querySelector('td:last-child time')?.getAttribute('datetime') ?? ''
            newChapters.unshift({
                chapterId: cm[1],
                slug: cm[2],
                title: link.textContent?.trim() ?? '',
                url: `${BASE_URL}${href}`,
                publishedAt: datetime,
                order: i,
            })
        }

        return newChapters
    }
}
