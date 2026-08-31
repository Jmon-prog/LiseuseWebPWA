export interface FictionSummary {
    fictionId: string
    slug: string
    title: string
    author: string
    coverUrl: string
    url: string
}

export interface FictionDetails extends FictionSummary {
    description: string
    tags: string[]
    totalChapters: number
}

export interface ChapterMeta {
    chapterId: string
    slug: string
    title: string
    url: string
    publishedAt: string
    order: number
}

export interface ChapterContent {
    chapterId: string
    title: string
    html: string
    prevUrl?: string
    nextUrl?: string
}

export interface ISourceService {
    readonly sourceId: string
    readonly sourceName: string
    /** Retourne l'URL fiction canonique depuis une URL fiction ou chapitre. Null si non reconnue. */
    normalizeFictionUrl(input: string): string | null
    getFictionDetails(fictionUrl: string): Promise<FictionDetails>
    getChapterList(fictionUrl: string, onProgress?: (found: number, page: number) => void): Promise<ChapterMeta[]>
    getChapterContent(chapterUrl: string): Promise<ChapterContent>
    checkNewChapters(fictionUrl: string, lastKnownChapterId: string): Promise<ChapterMeta[]>
}

/** Clé d'injection Vue pour le registre des services sources */
export const SOURCE_REGISTRY_KEY = Symbol('sourceRegistry')
