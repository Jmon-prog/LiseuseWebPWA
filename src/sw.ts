import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope & typeof globalThis

const APP_BASE = '/LiseuseWebPWA/'
const DB_NAME = 'LiseuseWebDB'
const DB_VERSION = 1
const PROXY_URL = 'https://liseuseweb-proxy.montangon-julien.workers.dev/'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Permet à la page de déclencher la mise à jour sans fermer toutes les fenêtres
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// Cache des couvertures RoyalRoad
registerRoute(
    ({ url }) =>
        url.hostname === 'www.royalroadcdn.com' &&
        url.pathname.startsWith('/public/covers-'),
    new CacheFirst({
        cacheName: 'rr-covers',
        plugins: [
            new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }),
        ],
    })
)

// Pages RoyalRoad — NetworkFirst
registerRoute(
    ({ url }) => url.hostname === 'www.royalroad.com',
    new NetworkFirst({
        cacheName: 'rr-pages',
        plugins: [
            new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }),
        ],
        networkTimeoutSeconds: 10,
    })
)

// Ouvrir / focus l'app quand l'utilisateur tape sur une notification
self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const appUrl = self.location.origin + APP_BASE
    const fictionId: number | undefined = event.notification.data?.fictionDbId
    const target = fictionId ? `${appUrl}#/fiction/${fictionId}/chapters` : appUrl
    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => {
                const existing = clients.find((c) => c.url.startsWith(appUrl))
                if (existing) { existing.focus(); return }
                return self.clients.openWindow(target)
            })
    )
})

// ──────────────────────────────────────────────
// Periodic Background Sync — vérification toutes les heures
// ──────────────────────────────────────────────
self.addEventListener('periodicsync', (event: Event) => {
    const syncEvent = event as any
    if (syncEvent.tag === 'check-new-chapters') {
        syncEvent.waitUntil(checkAllFictionsForNewChapters())
    }
})

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((res, rej) => {
        req.onsuccess = () => res(req.result)
        req.onerror = () => rej(req.error)
    })
}

async function openIDB(): Promise<IDBDatabase> {
    return new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onsuccess = () => res(req.result)
        req.onerror = () => rej(req.error)
    })
}

async function fetchHTML(url: string): Promise<string> {
    const opts: RequestInit = { signal: AbortSignal.timeout(20000) }
    try {
        const r = await fetch(url, opts)
        if (r.ok) return r.text()
    } catch { /* réseau ou CORS → proxy */ }
    const r = await fetch(`${PROXY_URL}?url=${encodeURIComponent(url)}`, opts)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.text()
}

async function checkAllFictionsForNewChapters() {
    const idb = await openIDB()
    const tx = idb.transaction(['fictions', 'chapters'], 'readonly')

    // Récupère toutes les fictions
    const fictions: any[] = await idbRequest(tx.objectStore('fictions').getAll())

    for (const fiction of fictions) {
        try {
            // Les nouveautés apparaissent sur la première page de Royal Road;
            // comparer les IDs évite les faux négatifs pour les longues fictions paginées.
            const chapStore = idb.transaction('chapters', 'readonly').objectStore('chapters')
            const idx = chapStore.index('fictionDbId')
            const storedChapters = await idbRequest(idx.getAll(IDBKeyRange.only(fiction.id)))
            const storedIds = new Set(storedChapters.map(chapter => chapter.chapterId))

            // Fetch page RoyalRoad et extrait les IDs de chapitre par regex (pas de DOM dans SW)
            const html = await fetchHTML(fiction.url)
            const matches = html.match(/\/chapter\/(\d+)\//g) ?? []
            const uniqueIds = new Set(matches)
            const newIds = [...uniqueIds]
                .map(match => match.match(/\d+/)?.[0] ?? '')
                .filter(chapterId => chapterId && !storedIds.has(chapterId))
            const latestChapterId = [...uniqueIds]
                .map(match => match.match(/\d+/)?.[0] ?? '')
                .sort((left, right) => Number(right) - Number(left))[0]

            if (newIds.length > 0 && latestChapterId && latestChapterId !== fiction.lastNotifiedChapterId) {
                const newCount = newIds.length
                await self.registration.showNotification('📖 Nouveaux chapitres !', {
                    body: `« ${fiction.title} » — ${newCount} nouveau${newCount > 1 ? 'x' : ''} chapitre${newCount > 1 ? 's' : ''} disponible${newCount > 1 ? 's' : ''}`,
                    icon: self.location.origin + APP_BASE + 'pwa-192x192.png',
                    badge: self.location.origin + APP_BASE + 'pwa-192x192.png',
                    tag: `new-chapters-${fiction.id}`,
                    renotify: true,
                    data: { fictionDbId: fiction.id },
                } as NotificationOptions)
                await idbRequest(
                    idb.transaction('fictions', 'readwrite')
                        .objectStore('fictions')
                        .put({ ...fiction, lastNotifiedChapterId: latestChapterId })
                )
            }

            // Délai entre chaque fiction pour éviter le rate-limiting
            await new Promise(r => setTimeout(r, 2000))
        } catch { /* on ignore les erreurs par fiction */ }
    }

    idb.close()
}

