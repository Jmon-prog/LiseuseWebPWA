<template>
  <div class="fiction-card" :class="{ 'fiction-card--unread': fiction.unreadCount > 0 }" @click="$emit('click')">
    <div class="fiction-card__cover">
      <img :src="fiction.coverUrl" :alt="fiction.title" loading="lazy" @error="onImgError" />
      <span v-if="fiction.unreadCount > 0" class="fiction-card__badge">
        +{{ fiction.unreadCount }} nouveau{{ fiction.unreadCount > 1 ? 'x' : '' }}
      </span>
      <button
        class="fiction-card__delete"
        title="Supprimer"
        @click.stop="$emit('remove')"
      >✕</button>
    </div>
    <div class="fiction-card__info">
      <p class="fiction-card__title">{{ fiction.title }}</p>
      <p class="fiction-card__author">{{ fiction.author }}</p>
      <p class="fiction-card__source">{{ fiction.sourceId }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FictionRecord } from '@/db'

defineProps<{ fiction: FictionRecord }>()
defineEmits<{ click: []; remove: [] }>()

function onImgError(e: Event) {
  const img = e.target as HTMLImageElement
  img.src = '/cover-placeholder.svg'
}
</script>

<style scoped>
.fiction-card {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-surface);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  transition: transform 0.15s, box-shadow 0.15s;
  display: flex;
  flex-direction: column;
}
.fiction-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}
.fiction-card__cover {
  position: relative;
  aspect-ratio: 2 / 3;
  background: #ddd;
}
.fiction-card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fiction-card--unread {
  box-shadow: 0 0 0 2px var(--color-accent), 0 2px 8px rgba(0, 0, 0, 0.12);
}
.fiction-card__badge {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-accent);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 4px 6px;
  text-align: center;
  letter-spacing: 0.02em;
}
.fiction-card__delete {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  font-size: 0.75rem;
  line-height: 1;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.fiction-card:hover .fiction-card__delete {
  display: flex;
}
.fiction-card__info {
  padding: 8px 10px 10px;
}
.fiction-card__title {
  font-weight: 600;
  font-size: 0.85rem;
  margin: 0 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fiction-card__author,
.fiction-card__source {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
