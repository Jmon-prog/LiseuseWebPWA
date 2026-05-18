import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, type FictionRecord, type ChapterRecord } from '@/db'
import { resolveService } from '@/sources'

export const useLibraryStore = defineStore('library', () => {
    const fictions = ref<FictionRecord[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)

    async function loadLibrary() {
        fictions.value = await db.fictions.orderBy('lastUpdatedAt').reverse().toArray()
    }

    async function addFiction(url: string): Promise<FictionRecord> {
        const service = resolveService(url)
        if (!service) throw new Error('Source non supportée pour cette URL')

        const canonicalUrl = service.normalizeFictionUrl(url)!
        const existing = await db.fictions.where('url').equals(canonicalUrl).first()
        if (existing) throw new Error('Cette fiction est déjà dans votre bibliothèque')

        loading.value = true
        error.value = null
        try {
            const details = await service.getFictionDetails(canonicalUrl)
            const now = Date.now()

            const id = await db.fictions.add({
                sourceId: service.sourceId,
                fictionId: details.fictionId,
                slug: details.slug,
                title: details.title,
                author: details.author,
                description: details.description,
                coverUrl: details.coverUrl,
                tags: details.tags,
                url: canonicalUrl,
                addedAt: now,
                lastUpdatedAt: now,
                totalChapters: details.totalChapters,
                unreadCount: details.totalChapters,
            })

            const record = (await db.fictions.get(id))!
            await loadLibrary()
            return record
        } finally {
            loading.value = false
        }
    }

    async function removeFiction(id: number) {
        await db.chapters.where('fictionDbId').equals(id).delete()
        await db.fictions.delete(id)
        await loadLibrary()
    }

    const refreshProgress = ref<{ found: number; page: number } | null>(null)

    async function refreshChapters(fiction: FictionRecord): Promise<number> {
        const service = resolveService(fiction.url)
        if (!service) throw new Error('Service source introuvable')

        refreshProgress.value = { found: 0, page: 1 }
        const remoteChapters = await service.getChapterList(fiction.url, (found, page) => {
            refreshProgress.value = { found, page }
        })
        refreshProgress.value = null
        const localChapters = await db.chapters
            .where('fictionDbId').equals(fiction.id!)
            .sortBy('order')

        const localIds = new Set(localChapters.map(c => c.chapterId))
        const newOnes = remoteChapters.filter(c => !localIds.has(c.chapterId))

        if (newOnes.length > 0) {
            await db.chapters.bulkAdd(
                newOnes.map(c => ({
                    fictionDbId: fiction.id!,
                    chapterId: c.chapterId,
                    slug: c.slug,
                    title: c.title,
                    url: c.url,
                    publishedAt: c.publishedAt,
                    isRead: false,
                    order: c.order,
                }))
            )

            await db.fictions.update(fiction.id!, {
                totalChapters: remoteChapters.length,
                unreadCount: (fiction.unreadCount ?? 0) + newOnes.length,
                lastUpdatedAt: Date.now(),
            })

            await loadLibrary()
        }

        return newOnes.length
    }

    async function getChapters(fictionDbId: number): Promise<ChapterRecord[]> {
        return db.chapters.where('fictionDbId').equals(fictionDbId).sortBy('order')
    }

    const downloadProgress = ref<{ done: number; total: number } | null>(null)
    let downloadAborted = false

    async function downloadAllChapters(
        fiction: FictionRecord,
        onProgress?: (done: number, total: number) => void
    ): Promise<{ done: number; skipped: number }> {
        const service = resolveService(fiction.url)
        if (!service) throw new Error('Service source introuvable')

        const all = await db.chapters
            .where('fictionDbId').equals(fiction.id!)
            .sortBy('order')

        const pending = all.filter(c => !c.content)
        downloadAborted = false
        downloadProgress.value = { done: 0, total: pending.length }

        let done = 0
        for (const ch of pending) {
            if (downloadAborted) break
            try {
                const content = await service.getChapterContent(ch.url)
                await db.chapters.update(ch.id!, { content: content.html })
                done++
            } catch {
                // On continue même si un chapitre échoue
            }
            downloadProgress.value = { done, total: pending.length }
            onProgress?.(done, pending.length)
            // Pause anti rate-limit
            await new Promise(r => setTimeout(r, 400))
        }

        downloadProgress.value = null
        return { done, skipped: pending.length - done }
    }

    function abortDownload() {
        downloadAborted = true
    }

    const totalUnread = computed(() =>
        fictions.value.reduce((sum, f) => sum + (f.unreadCount ?? 0), 0)
    )

    return {
        refreshProgress,
        downloadProgress,
        fictions,
        loading,
        error,
        totalUnread,
        loadLibrary,
        addFiction,
        removeFiction,
        refreshChapters,
        getChapters,
        downloadAllChapters,
        abortDownload,
    }
})
