import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope & typeof globalThis

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

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
  const appUrl = self.location.origin + '/LiseuseWebPWA/'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.startsWith(appUrl))
        if (existing) return existing.focus()
        return self.clients.openWindow(appUrl)
      })
  )
})
