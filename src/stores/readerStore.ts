import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, type FictionRecord, type ChapterRecord } from '@/db'
import { resolveService } from '@/sources'

export const useReaderStore = defineStore('reader', () => {
    const fiction = ref<FictionRecord | null>(null)
    const chapter = ref<ChapterRecord | null>(null)
    const chapterHtml = ref('')
    const loading = ref(false)
    const error = ref<string | null>(null)

    async function openChapter(fictionRecord: FictionRecord, chapterRecord: ChapterRecord) {
        fiction.value = fictionRecord
        chapter.value = chapterRecord
        loading.value = true
        error.value = null

        try {
            // Utiliser le contenu offline s'il est disponible
            if (chapterRecord.content) {
                chapterHtml.value = chapterRecord.content
            } else {
                const service = resolveService(fictionRecord.url)
                if (!service) throw new Error('Service source introuvable')
                const content = await service.getChapterContent(chapterRecord.url)
                chapterHtml.value = content.html
            }

            // Marquer comme lu
            await db.chapters.update(chapterRecord.id!, { isRead: true })

            // Mettre à jour unreadCount
            const unread = await db.chapters
                .where('fictionDbId').equals(fictionRecord.id!)
                .and(c => !c.isRead)
                .count()

            await db.fictions.update(fictionRecord.id!, {
                lastReadChapterId: chapterRecord.chapterId,
                unreadCount: unread,
            })
        } finally {
            loading.value = false
        }
    }

    async function saveScrollPosition(scrollY: number) {
        if (!fiction.value?.id) return
        await db.fictions.update(fiction.value.id, { lastReadScrollY: scrollY })
    }

    async function downloadChapter(chapterRecord: ChapterRecord, fictionRecord: FictionRecord) {
        if (chapterRecord.content) return // déjà téléchargé
        const service = resolveService(fictionRecord.url)
        if (!service) throw new Error('Service source introuvable')
        const content = await service.getChapterContent(chapterRecord.url)
        await db.chapters.update(chapterRecord.id!, { content: content.html })
    }

    function clear() {
        fiction.value = null
        chapter.value = null
        chapterHtml.value = ''
        error.value = null
    }

    return {
        fiction,
        chapter,
        chapterHtml,
        loading,
        error,
        openChapter,
        saveScrollPosition,
        downloadChapter,
        clear,
    }
})
