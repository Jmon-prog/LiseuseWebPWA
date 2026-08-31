import type { ChapterRecord, FictionRecord } from '@/db'

const encoder = new TextEncoder()
const crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1
    return value >>> 0
})

function crc32(bytes: Uint8Array) {
    let value = 0xffffffff
    for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
    return (value ^ 0xffffffff) >>> 0
}

function write16(target: Uint8Array, offset: number, value: number) {
    target[offset] = value & 0xff
    target[offset + 1] = value >>> 8
}

function write32(target: Uint8Array, offset: number, value: number) {
    target[offset] = value & 0xff
    target[offset + 1] = value >>> 8
    target[offset + 2] = value >>> 16
    target[offset + 3] = value >>> 24
}

interface ZipEntry {
    name: string
    content: string
}

function createZip(entries: ZipEntry[]) {
    const chunks: Uint8Array[] = []
    const centralEntries: Uint8Array[] = []
    let offset = 0

    for (const entry of entries) {
        const name = encoder.encode(entry.name)
        const content = encoder.encode(entry.content)
        const checksum = crc32(content)
        const local = new Uint8Array(30 + name.length + content.length)
        write32(local, 0, 0x04034b50)
        write16(local, 4, 20)
        write32(local, 14, checksum)
        write32(local, 18, content.length)
        write32(local, 22, content.length)
        write16(local, 26, name.length)
        local.set(name, 30)
        local.set(content, 30 + name.length)
        chunks.push(local)

        const central = new Uint8Array(46 + name.length)
        write32(central, 0, 0x02014b50)
        write16(central, 4, 20)
        write16(central, 6, 20)
        write32(central, 16, checksum)
        write32(central, 20, content.length)
        write32(central, 24, content.length)
        write16(central, 28, name.length)
        write32(central, 42, offset)
        central.set(name, 46)
        centralEntries.push(central)
        offset += local.length
    }

    const centralSize = centralEntries.reduce((total, entry) => total + entry.length, 0)
    const end = new Uint8Array(22)
    write32(end, 0, 0x06054b50)
    write16(end, 8, entries.length)
    write16(end, 10, entries.length)
    write32(end, 12, centralSize)
    write32(end, 16, offset)
    return new Blob([...chunks, ...centralEntries, end], { type: 'application/epub+zip' })
}

function escapeXml(value: string) {
    return value.replace(/[<>&'"]/g, character => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
    })[character]!)
}

function chapterFileName(index: number) {
    return `chapter-${String(index + 1).padStart(4, '0')}.xhtml`
}

export function getEpubChapterHref(chapterId: string, chapters: ChapterRecord[]) {
    const index = chapters.filter(chapter => chapter.content).findIndex(chapter => chapter.chapterId === chapterId)
    return index === -1 ? null : chapterFileName(index)
}

function chapterDocument(chapter: ChapterRecord) {
    const document = new DOMParser().parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html')
    const content = document.createElement('div')
    content.innerHTML = chapter.content!
    return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeXml(chapter.title)}</title><link rel="stylesheet" type="text/css" href="style.css" /></head><body><section epub:type="bodymatter chapter" xmlns:epub="http://www.idpf.org/2007/ops"><h1>${escapeXml(chapter.title)}</h1>${new XMLSerializer().serializeToString(content)}</section></body></html>`
}

export function createEpub(fiction: FictionRecord, chapters: ChapterRecord[]) {
    const available = chapters.filter(chapter => chapter.content)
    if (available.length === 0) throw new Error('Téléchargez au moins un chapitre avant de créer l’EPUB.')

    const identifier = `urn:liseuseweb:${fiction.sourceId}:${fiction.fictionId}`
    const currentIndex = available.findIndex(chapter => chapter.chapterId === fiction.lastReadChapterId)
    const readingIndex = currentIndex === -1 ? 0 : currentIndex
    const manifest = available.map((_, index) => `<item id="chapter-${index}" href="${chapterFileName(index)}" media-type="application/xhtml+xml" />`).join('')
    const spine = available.map((_, index) => `<itemref idref="chapter-${index}" />`).join('')
    const navItems = available.map((chapter, index) => `<li><a href="${chapterFileName(index)}">${escapeXml(chapter.title)}</a></li>`).join('')
    const readingFile = chapterFileName(readingIndex)

    return createZip([
        { name: 'mimetype', content: 'application/epub+zip' },
        { name: 'META-INF/container.xml', content: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml" /></rootfiles></container>' },
        { name: 'EPUB/style.css', content: 'body { font-family: serif; line-height: 1.6; margin: 5%; } img { max-width: 100%; height: auto; } h1 { page-break-before: always; }' },
        { name: 'EPUB/nav.xhtml', content: `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Table des matières</title></head><body><nav epub:type="toc" id="toc"><h1>Table des matières</h1><ol>${navItems}</ol></nav></body></html>` },
        { name: 'EPUB/package.opf', content: `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" prefix="liseuse: https://liseuseweb.app/metadata/"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier><dc:title>${escapeXml(fiction.title)}</dc:title><dc:creator>${escapeXml(fiction.author)}</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta><meta property="liseuse:last-read-chapter">${escapeXml(fiction.lastReadChapterId ?? available[0].chapterId)}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />${manifest}<item id="style" href="style.css" media-type="text/css" /></manifest><spine>${spine}</spine><guide><reference type="text" title="Dernière lecture" href="${readingFile}" /></guide></package>` },
        ...available.map((chapter, index) => ({ name: `EPUB/${chapterFileName(index)}`, content: chapterDocument(chapter) })),
    ])
}

export function downloadEpub(fiction: FictionRecord, chapters: ChapterRecord[]) {
    const url = URL.createObjectURL(createEpub(fiction, chapters))
    const link = document.createElement('a')
    link.href = url
    link.download = `${fiction.title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'fiction'}.epub`
    link.click()
    URL.revokeObjectURL(url)
}