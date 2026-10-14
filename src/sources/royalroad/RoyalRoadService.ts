import type {
    ISourceService,
    FictionDetails,
    ChapterMeta,
    ChapterContent,
} from '@/core/interfaces/ISourceService'

const BASE_URL = 'https://www.royalroad.com'
const CDN_URL = 'https://www.royalroadcdn.com'
const PROXY_URL = 'https://liseuseweb-proxy.montangon-julien.workers.dev/'
const FICTION_REGEX = /royalroad\.com\/fiction\/(\d+)\/([\w-]+)/

function sanitizeChapterHtml(content: Element) {
    content.querySelectorAll('script, style, iframe, object, embed, form, base, link, meta').forEach(element => element.remove())
    content.querySelectorAll('*').forEach(element => {
        for (const attribute of [...element.attributes]) {
            if (attribute.name.startsWith('on') || attribute.name === 'srcdoc') {
                element.removeAttribute(attribute.name)
                continue
            }
            if (!['href', 'src', 'xlink:href'].includes(attribute.name)) continue
            try {
                const url = new URL(attribute.value, BASE_URL)
                if (!['http:', 'https:'].includes(url.protocol)) element.removeAttribute(attribute.name)
                else element.setAttribute(attribute.name, url.href)
            } catch {
                element.removeAttribute(attribute.name)
            }
        }
    })
}

const CHAPTER_ROW_SELECTOR = '#chapters tr.chapter-row'

// Royal Road injecte des spans anti-piratage masqués via une classe aléatoire définie dans un <style>.
function removeHiddenWatermarks(doc: Document, content: Element) {
    const hiddenClasses = new Set<string>()
    doc.querySelectorAll('style').forEach(style => {
        for (const m of (style.textContent ?? '').matchAll(/\.([\w-]+)\s*\{[^}]*display\s*:\s*none/g)) hiddenClasses.add(m[1])
    })
    hiddenClasses.forEach(cls => content.querySelectorAll(`.${CSS.escape(cls)}`).forEach(el => el.remove()))
}

function parseChapterRows(doc: Document): ChapterMeta[] {
    const chapters: ChapterMeta[] = []
    doc.querySelectorAll(CHAPTER_ROW_SELECTOR).forEach(row => {
        const href = row.getAttribute('data-url') ?? row.querySelector('a')?.getAttribute('href') ?? ''
        const cm = href.match(/\/chapter\/(\d+)\/([\w-]+)/)
        if (!cm) return
        chapters.push({
            chapterId: cm[1],
            slug: cm[2],
            title: row.querySelector('td a')?.textContent?.trim() ?? '',
            url: new URL(href, BASE_URL).href,
            publishedAt: row.querySelector('time')?.getAttribute('datetime') ?? '',
            volumeId: row.getAttribute('data-volume-id') ?? undefined,
            order: chapters.length,
        })
    })
    return chapters
}

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

    /** Tente d'abord un fetch direct, bascule sur le Worker si le navigateur bloque le CORS. */
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
            // Royal Road bloque le CORS navigateur → Worker Cloudflare dédié.
            const proxied = `${PROXY_URL}?url=${encodeURIComponent(url)}`
            const res = await fetch(proxied)
            if (res.status === 429) {
                if (attempt <= 3) {
                    await new Promise(r => setTimeout(r, 2000 * attempt))
                    return this.fetchDoc(url, attempt + 1)
                }
                throw new Error(`Fetch échoué [429] : ${url}`)
            }
            if (!res.ok) throw new Error(`Fetch échoué [${res.status}] : ${url}`)
            html = await res.text()
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

        const totalChapters = doc.querySelectorAll(CHAPTER_ROW_SELECTOR).length

        return {
            fictionId: ids.fictionId,
            slug: ids.slug,
            title,
            author,
            description,
            tags,
            coverUrl,
            url: fictionUrl,
            totalChapters,
        }
    }

    async getChapterList(fictionUrl: string, onProgress?: (found: number, page: number) => void): Promise<ChapterMeta[]> {
        // Tous les chapitres sont sur une seule page (pagination côté client).
        const chapters = parseChapterRows(await this.fetchDoc(fictionUrl))
        onProgress?.(chapters.length, 1)
        return chapters
    }

    async getChapterContent(chapterUrl: string): Promise<ChapterContent> {
        const doc = await this.fetchDoc(chapterUrl)

        const title = doc.querySelector('h1')?.textContent?.trim() ?? ''
        const contentEl = doc.querySelector('.chapter-inner')
        if (!contentEl) throw new Error('Contenu du chapitre introuvable')

        // Supprimer les publicités
        contentEl.querySelectorAll('.advert, [class*="advert"], .ad-container').forEach(el => el.remove())
        removeHiddenWatermarks(doc, contentEl)
        sanitizeChapterHtml(contentEl)
        const html = contentEl.innerHTML

        const chapterMatch = chapterUrl.match(/\/chapter\/(\d+)\//)

        // <link rel="prev|next"> dans le <head>, sinon boutons .nav-buttons (absents/désactivés aux extrémités).
        const navHref = (rel: 'prev' | 'next', label: string) =>
            doc.querySelector(`link[rel="${rel}"]`)?.getAttribute('href')
            ?? Array.from(doc.querySelectorAll<HTMLAnchorElement>('.nav-buttons a[href*="/chapter/"]'))
                .find(a => a.textContent?.replace(/\s+/g, ' ').toLowerCase().includes(label))?.getAttribute('href')

        const prevHref = navHref('prev', 'previous')
        const nextHref = navHref('next', 'next')

        return {
            chapterId: chapterMatch?.[1] ?? '',
            title,
            html,
            prevUrl: prevHref ? new URL(prevHref, BASE_URL).href : undefined,
            nextUrl: nextHref ? new URL(nextHref, BASE_URL).href : undefined,
        }
    }

    async checkNewChapters(fictionUrl: string, lastKnownChapterId: string): Promise<ChapterMeta[]> {
        const chapters = parseChapterRows(await this.fetchDoc(fictionUrl))
        const lastIndex = chapters.findIndex(c => c.chapterId === lastKnownChapterId)
        return lastIndex === -1 ? chapters : chapters.slice(lastIndex + 1)
    }
}
