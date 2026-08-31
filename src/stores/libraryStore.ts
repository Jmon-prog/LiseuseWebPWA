import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, type FictionRecord, type ChapterRecord } from '@/db'
import { resolveService } from '@/sources'
import { downloadEpub } from '@/core/services/epub'

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

    const syncingAll = ref(false)
    const syncAllProgress = ref<{ done: number; total: number; title: string } | null>(null)

    async function refreshAllFictions() {
        if (syncingAll.value) return
        const list = [...fictions.value]
        if (list.length === 0) return
        syncingAll.value = true
        syncAllProgress.value = { done: 0, total: list.length, title: '' }
        try {
            for (let i = 0; i < list.length; i++) {
                syncAllProgress.value = { done: i, total: list.length, title: list[i].title }
                try {
                    await refreshChapters(list[i])
                } catch { /* on ignore les erreurs par fiction */ }
            }
        } finally {
            syncingAll.value = false
            syncAllProgress.value = null
        }
    }

    const downloadProgress = ref<{ done: number; total: number; title: string } | null>(null)
    let downloadAborted = false

    async function sendNotification(title: string, body: string) {
        const icon = '/LiseuseWebPWA/pwa-192x192.png'
        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration()
                if (reg) { reg.showNotification(title, { body, icon }); return }
            }
            if (Notification.permission === 'granted') {
                new Notification(title, { body, icon })
            }
        } catch { /* notifications non supportées */ }
    }

    async function downloadAllChapters(
        fiction: FictionRecord,
        onProgress?: (done: number, total: number) => void
    ): Promise<{ done: number; skipped: number }> {
        if (Notification.permission === 'default') {
            await Notification.requestPermission()
        }

        const service = resolveService(fiction.url)
        if (!service) throw new Error('Service source introuvable')

        const all = await db.chapters
            .where('fictionDbId').equals(fiction.id!)
            .sortBy('order')

        const pending = all.filter(c => !c.content)
        downloadAborted = false
        downloadProgress.value = { done: 0, total: pending.length, title: fiction.title }

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
            downloadProgress.value = { done, total: pending.length, title: fiction.title }
            onProgress?.(done, pending.length)
            // Pause anti rate-limit
            await new Promise(r => setTimeout(r, 400))
        }

        downloadProgress.value = null

        if (!downloadAborted) {
            await sendNotification(
                '📥 Téléchargement terminé',
                `« ${fiction.title} » — ${done} chapitre${done > 1 ? 's' : ''} téléchargé${done > 1 ? 's' : ''}`
            )
        }

        return { done, skipped: pending.length - done }
    }

    function abortDownload() {
        downloadAborted = true
    }

    async function exportEpub(fiction: FictionRecord) {
        await downloadAllChapters(fiction)
        const [updatedFiction, chapters] = await Promise.all([
            db.fictions.get(fiction.id!),
            getChapters(fiction.id!),
        ])
        if (!updatedFiction) throw new Error('Fiction introuvable')
        downloadEpub(updatedFiction, chapters)
    }

    async function markAllAsRead(fictionDbId: number) {
        await db.chapters.where('fictionDbId').equals(fictionDbId).modify({ isRead: true })
        await db.fictions.update(fictionDbId, { unreadCount: 0 })
        await loadLibrary()
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
        exportEpub,
        markAllAsRead,
        syncingAll,
        syncAllProgress,
        refreshAllFictions,
    }
})
