import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: '/LiseuseWebPWA/',
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'cover-placeholder.svg'],
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'LiseuseWeb',
        short_name: 'Liseuse',
        description: 'Liseuse PWA locale pour suivre vos fictions en ligne',
        theme_color: '#2563eb',
        background_color: '#1e1e2e',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        id: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache des couvertures (CDN Royal Road — covers-large et covers-full)
            urlPattern: /^https:\/\/www\.royalroadcdn\.com\/public\/covers-/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'rr-covers',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Pages Royal Road — NetworkFirst pour contenu à jour
            urlPattern: /^https:\/\/www\.royalroad\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rr-pages',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
