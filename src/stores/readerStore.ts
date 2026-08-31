import { defineStore } from 'pinia'
import { db, type FictionRecord, type ChapterRecord } from '@/db'
import { resolveService } from '@/sources'

export const useReaderStore = defineStore('reader', () => {
    async function openChapter(fictionRecord: FictionRecord, chapterRecord: ChapterRecord) {
        await downloadChapter(chapterRecord, fictionRecord)
        await db.chapters.update(chapterRecord.id!, { isRead: true })
        const unread = await db.chapters
            .where('fictionDbId').equals(fictionRecord.id!)
            .and(chapter => !chapter.isRead)
            .count()
        await db.fictions.update(fictionRecord.id!, {
            lastReadChapterId: chapterRecord.chapterId,
            unreadCount: unread,
        })
    }

    async function downloadChapter(chapterRecord: ChapterRecord, fictionRecord: FictionRecord) {
        if (chapterRecord.content) return // déjà téléchargé
        const service = resolveService(fictionRecord.url)
        if (!service) throw new Error('Service source introuvable')
        const content = await service.getChapterContent(chapterRecord.url)
        chapterRecord.content = content.html
        await db.chapters.update(chapterRecord.id!, { content: content.html })
    }

    return {
        openChapter,
        downloadChapter,
    }
})
