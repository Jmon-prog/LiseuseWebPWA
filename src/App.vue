<template>
  <RouterView />

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
import { onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settingsStore'
import { useLibraryStore } from '@/stores/libraryStore'

const settings = useSettingsStore()
const library = useLibraryStore()
onMounted(() => settings.applyTheme())
</script>

<style>
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
