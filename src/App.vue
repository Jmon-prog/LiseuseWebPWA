<template>
  <RouterView />

  <!-- Bannière mise à jour PWA -->
  <Transition name="dl-slide">
    <div v-if="needRefresh && !dismissedUpdate" class="update-bar">
      <span>🆕 Mise à jour disponible</span>
      <button class="update-bar__btn" @click="updateServiceWorker(true)">Recharger</button>
      <button class="update-bar__close" @click="dismissedUpdate = true">✕</button>
    </div>
  </Transition>

  <!-- Bandeau de téléchargement global -->
  <Transition name="dl-slide">
    <div v-if="library.downloadProgress" class="dl-bar">
      <div class="dl-bar__inner">
        <span class="dl-bar__icon">📥</span>
        <div class="dl-bar__info">
          <span class="dl-bar__title">{{ library.downloadProgress.title }}</span>
          <span class="dl-bar__count">{{ library.downloadProgress.done }} / {{ library.downloadProgress.total }} chapitres</span>
        </div>
        <div class="dl-bar__track">
          <div
            class="dl-bar__fill"
            :style="{ width: (library.downloadProgress.done / library.downloadProgress.total * 100) + '%' }"
          />
        </div>
        <button class="dl-bar__cancel" @click="library.abortDownload()">✕</button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useSettingsStore } from '@/stores/settingsStore'
import { useLibraryStore } from '@/stores/libraryStore'

const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegistered(r: ServiceWorkerRegistration | undefined) {
    r && setInterval(() => r.update(), 60 * 60 * 1000) // Vérifie les mises à jour toutes les heures
  },
})
const dismissedUpdate = ref(false)

const settings = useSettingsStore()
const library = useLibraryStore()

onMounted(async () => {
  settings.applyTheme()
  await registerPeriodicSync()
})

async function registerPeriodicSync() {
  if (!('serviceWorker' in navigator) || !('periodicSync' in (await navigator.serviceWorker.ready))) return
  try {
    const reg = await navigator.serviceWorker.ready
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName })
    if (status.state !== 'granted') return
    await (reg as any).periodicSync.register('check-new-chapters', {
      minInterval: 60 * 60 * 1000, // 1 heure
    })
  } catch { /* API non supportée sur ce navigateur */ }
}
</script>

<style>
.update-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1001;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px env(safe-area-inset-top);
  background: var(--color-accent, #2563eb);
  color: #fff;
  font-size: 0.9rem;
}
.update-bar span { flex: 1 }
.update-bar__btn {
  background: #fff;
  color: var(--color-accent, #2563eb);
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  font-weight: 600;
  cursor: pointer;
}
.update-bar__close {
  background: none;
  border: none;
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
  opacity: 0.8;
}
.dl-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  padding: 0 0 env(safe-area-inset-bottom);
  background: var(--color-surface, #fff);
  border-top: 2px solid var(--color-accent, #2563eb);
  box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
}
.dl-bar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
}
.dl-bar__icon {
  font-size: 1.2rem;
  flex-shrink: 0;
}
.dl-bar__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dl-bar__title {
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dl-bar__count {
  font-size: 0.75rem;
  color: var(--color-text-muted, #888);
}
.dl-bar__track {
  width: 80px;
  height: 4px;
  background: var(--color-border, #e0e0e0);
  border-radius: 2px;
  overflow: hidden;
  flex-shrink: 0;
}
.dl-bar__fill {
  height: 100%;
  background: var(--color-accent, #2563eb);
  border-radius: 2px;
  transition: width 0.3s ease;
}
.dl-bar__cancel {
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  color: var(--color-text-muted, #888);
  padding: 4px;
  flex-shrink: 0;
}
.dl-slide-enter-active,
.dl-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.dl-slide-enter-from,
.dl-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
