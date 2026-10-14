import { defineStore } from 'pinia'
import { db, type FictionRecord, type ChapterRecord } from '@/db'
import { isAnnouncement } from '@/core/models/chapter'
import { resolveService } from '@/sources'

export const useReaderStore = defineStore('reader', () => {
    async function openChapter(fictionRecord: FictionRecord, chapterRecord: ChapterRecord): Promise<string> {
        await downloadChapter(chapterRecord, fictionRecord)
        await db.fictions.update(fictionRecord.id!, {
            lastReadChapterId: chapterRecord.chapterId,
        })
        return chapterRecord.content!
    }

    async function downloadChapter(chapterRecord: ChapterRecord, fictionRecord: FictionRecord) {
        if (chapterRecord.content) return // déjà téléchargé
        const service = resolveService(fictionRecord.url)
        if (!service) throw new Error('Service source introuvable')
        const content = await service.getChapterContent(chapterRecord.url)
        chapterRecord.content = content.html
        await db.chapters.update(chapterRecord.id!, { content: content.html })
    }

    async function saveScrollPosition(fictionId: number, chapter: ChapterRecord, scrollY: number) {
        await db.chapters.update(chapter.id!, { readingPosition: scrollY })
        await db.fictions.update(fictionId, {
            lastReadChapterId: chapter.chapterId,
            lastReadScrollY: scrollY,
        })
    }

    async function setChapterRead(fictionId: number, chapter: ChapterRecord, isRead: boolean) {
        if (chapter.isRead === isRead) return
        await db.chapters.update(chapter.id!, { isRead })
        chapter.isRead = isRead
        const unreadCount = await db.chapters
            .where('fictionDbId').equals(fictionId)
            .and(record => !record.isRead && !isAnnouncement(record.title, record.slug))
            .count()
        await db.fictions.update(fictionId, { unreadCount })
    }

    return {
        openChapter,
        downloadChapter,
        saveScrollPosition,
        setChapterRead,
    }
})
