import Dexie, { type Table } from 'dexie'

export interface FictionRecord {
    id?: number
    sourceId: string
    fictionId: string
    slug: string
    title: string
    author: string
    description: string
    coverUrl: string
    tags: string[]
    url: string
    addedAt: number
    lastUpdatedAt: number
    lastReadChapterId?: string
    lastReadEpubCfi?: string
    lastReadScrollY?: number
    lastNotifiedChapterId?: string
    totalChapters: number
    unreadCount: number
}

export interface ChapterRecord {
    id?: number
    fictionDbId: number
    chapterId: string
    slug: string
    title: string
    url: string
    publishedAt: string
    isRead: boolean
    content?: string // HTML stocké pour lecture hors ligne
    order: number
}

class LiseuseDatabase extends Dexie {
    fictions!: Table<FictionRecord, number>
    chapters!: Table<ChapterRecord, number>

    constructor() {
        super('LiseuseWebDB')
        this.version(1).stores({
            fictions: '++id, sourceId, &fictionId, url, lastUpdatedAt',
            chapters: '++id, fictionDbId, chapterId, &url, isRead, order',
        })
    }
}

export const db = new LiseuseDatabase()
