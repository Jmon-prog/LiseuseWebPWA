import { db, type ChapterRecord, type FictionRecord } from './index'

export interface BackupSettings {
    theme: 'light' | 'dark' | 'sepia'
    fontFamily: 'serif' | 'sans-serif' | 'monospace'
    fontSize: number
    lineHeight: number
    columnWidth: number
    marginX: number
}

interface BackupFile {
    format: 'liseusewebpwa-backup'
    version: 1
    exportedAt: string
    settings: BackupSettings
    fictions: FictionRecord[]
    chapters: ChapterRecord[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

function isBackupSettings(value: unknown): value is BackupSettings {
    if (!isRecord(value)) return false
    return ['light', 'dark', 'sepia'].includes(String(value.theme))
        && ['serif', 'sans-serif', 'monospace'].includes(String(value.fontFamily))
        && isFiniteNumber(value.fontSize)
        && isFiniteNumber(value.lineHeight)
        && isFiniteNumber(value.columnWidth)
        && isFiniteNumber(value.marginX)
}

function isFictionRecord(value: unknown): value is FictionRecord {
    if (!isRecord(value)) return false
    return Number.isInteger(value.id)
        && typeof value.sourceId === 'string'
        && typeof value.fictionId === 'string'
        && typeof value.slug === 'string'
        && typeof value.title === 'string'
        && typeof value.author === 'string'
        && typeof value.description === 'string'
        && typeof value.coverUrl === 'string'
        && Array.isArray(value.tags) && value.tags.every(tag => typeof tag === 'string')
        && typeof value.url === 'string'
        && isFiniteNumber(value.addedAt)
        && isFiniteNumber(value.lastUpdatedAt)
        && (value.lastReadChapterId === undefined || typeof value.lastReadChapterId === 'string')
        && (value.lastReadScrollY === undefined || isFiniteNumber(value.lastReadScrollY))
        && (value.lastNotifiedChapterId === undefined || typeof value.lastNotifiedChapterId === 'string')
        && isFiniteNumber(value.totalChapters)
        && isFiniteNumber(value.unreadCount)
}

function isChapterRecord(value: unknown): value is ChapterRecord {
    if (!isRecord(value)) return false
    return Number.isInteger(value.id)
        && Number.isInteger(value.fictionDbId)
        && typeof value.chapterId === 'string'
        && typeof value.slug === 'string'
        && typeof value.title === 'string'
        && typeof value.url === 'string'
        && typeof value.publishedAt === 'string'
        && typeof value.isRead === 'boolean'
        && (value.content === undefined || typeof value.content === 'string')
        && (value.readingPosition === undefined || isFiniteNumber(value.readingPosition))
        && isFiniteNumber(value.order)
}

export async function createBackup(settings: BackupSettings): Promise<string> {
    const [fictions, chapters] = await Promise.all([
        db.fictions.toArray(),
        db.chapters.toArray(),
    ])
    const backup: BackupFile = {
        format: 'liseusewebpwa-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings,
        fictions,
        chapters,
    }
    return JSON.stringify(backup, null, 2)
}

export function parseBackup(json: string): BackupFile {
    let value: unknown
    try {
        value = JSON.parse(json)
    } catch {
        throw new Error('Le fichier ne contient pas un JSON valide.')
    }

    if (!isRecord(value)
        || value.format !== 'liseusewebpwa-backup'
        || value.version !== 1
        || typeof value.exportedAt !== 'string'
        || !isBackupSettings(value.settings)
        || !Array.isArray(value.fictions) || !value.fictions.every(isFictionRecord)
        || !Array.isArray(value.chapters) || !value.chapters.every(isChapterRecord)) {
        throw new Error('Ce fichier n’est pas une sauvegarde LiseuseWeb valide.')
    }

    const fictionIds = value.fictions.map(fiction => fiction.id!)
    if (new Set(fictionIds).size !== fictionIds.length) {
        throw new Error('La sauvegarde contient des identifiants de fiction en double.')
    }
    const knownFictionIds = new Set(fictionIds)
    const chapterIds = new Set<number>()
    const chapterUrls = new Set<string>()
    for (const chapter of value.chapters) {
        if (!knownFictionIds.has(chapter.fictionDbId)
            || chapterIds.has(chapter.id!)
            || chapterUrls.has(chapter.url)) {
            throw new Error('La sauvegarde contient des chapitres incohérents ou en double.')
        }
        chapterIds.add(chapter.id!)
        chapterUrls.add(chapter.url)
    }

    return value as unknown as BackupFile
}

function sanitizeImportedHtml(html: string): string {
    const document = new DOMParser().parseFromString(html, 'text/html')
    document.querySelectorAll('script, style, iframe, object, embed, form, base, link, meta')
        .forEach(element => element.remove())
    document.querySelectorAll('*').forEach(element => {
        for (const attribute of [...element.attributes]) {
            if (attribute.name.startsWith('on') || attribute.name === 'srcdoc') {
                element.removeAttribute(attribute.name)
                continue
            }
            if (!['href', 'src', 'xlink:href'].includes(attribute.name)) continue
            try {
                const url = new URL(attribute.value, 'https://www.royalroad.com')
                if (!['http:', 'https:'].includes(url.protocol)) element.removeAttribute(attribute.name)
                else element.setAttribute(attribute.name, url.href)
            } catch {
                element.removeAttribute(attribute.name)
            }
        }
    })
    return document.body.innerHTML
}

export async function restoreBackup(backup: BackupFile): Promise<void> {
    const chapters = backup.chapters.map(chapter => ({
        ...chapter,
        ...(chapter.content !== undefined ? { content: sanitizeImportedHtml(chapter.content) } : {}),
    }))

    await db.transaction('rw', db.fictions, db.chapters, async () => {
        await db.chapters.clear()
        await db.fictions.clear()
        if (backup.fictions.length) await db.fictions.bulkAdd(backup.fictions)
        if (chapters.length) await db.chapters.bulkAdd(chapters)
    })
}