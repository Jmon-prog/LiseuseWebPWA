export function isAnnouncement(title: string, slug = ''): boolean {
    return /^announcement(?:\b|[-_])/i.test(title.trim())
        || /^announcement(?:-|$)/i.test(slug)
}