<template>
  <div class="chapter-list">
    <header class="chapter-list__header">
      <button class="btn-back" @click="router.back()">← Retour</button>
      <div class="chapter-list__fiction-info">
        <img v-if="fiction" :src="fiction.coverUrl" class="chapter-list__cover" />
        <div>
          <h1 class="chapter-list__title">{{ fiction?.title ?? '…' }}</h1>
          <p class="chapter-list__author">{{ fiction?.author }}</p>
        </div>
      </div>
      <div class="chapter-list__toolbar">
        <button class="btn-refresh" :disabled="refreshing || downloading" @click="refresh">
          {{ refreshing ? 'Actualisation…' : '↻ Actualiser' }}
        </button>
        <button
          class="btn-download"
          :disabled="refreshing || downloading || allOffline"
          @click="downloading ? cancelDownload() : startDownload()"
        >
          <span v-if="downloading">
            ⏹ {{ library.downloadProgress?.done }}/{{ library.downloadProgress?.total }}
          </span>
          <span v-else-if="allOffline">✓ Hors ligne</span>
          <span v-else>💾 Télécharger</span>
        </button>
        <button
          class="btn-mark-read"
          :disabled="refreshing || downloading || unreadCount === 0"
          @click="markAllRead"
          title="Marquer tout comme lu"
        >✓ Tout lu</button>
        <button class="btn-sort" @click="sortDesc = !sortDesc" :title="sortDesc ? 'Du plus ancien au plus récent' : 'Du plus récent au plus ancien'">
          {{ sortDesc ? '↓ Récent' : '↑ Ancien' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="chapter-list__error">⚠️ {{ error }}</div>

    <div v-if="loading || refreshing" class="chapter-list__loading">
      <span v-if="library.refreshProgress">
        Page {{ library.refreshProgress.page }} — {{ library.refreshProgress.found }} chapitres trouvés…
      </span>
      <span v-else>Chargement des chapitres…</span>
    </div>

    <div v-if="!loading && !refreshing && chapters.length > 0" class="chapter-list__filters">
      <input
        v-model="searchQuery"
        type="search"
        aria-label="Rechercher un chapitre par titre"
        placeholder="Rechercher un chapitre…"
      />
      <div class="chapter-list__read-filter chapter-list__type-filter" role="group" aria-label="Type de publication">
        <button
          v-for="option in typeFilterOptions"
          :key="option.value"
          :class="{ 'is-active': typeFilter === option.value }"
          :aria-pressed="typeFilter === option.value"
          @click="typeFilter = option.value"
        >{{ option.label }} <span>{{ option.count }}</span></button>
      </div>
      <div class="chapter-list__read-filter" role="group" aria-label="Filtrer les publications par statut de lecture">
        <button
          v-for="option in readFilterOptions"
          :key="option.value"
          :class="{ 'is-active': readFilter === option.value }"
          :aria-pressed="readFilter === option.value"
          @click="readFilter = option.value"
        >{{ option.label }} <span>{{ option.count }}</span></button>
      </div>
    </div>

    <ul v-if="!loading && !refreshing && filteredChapters.length > 0" class="chapter-list__list">
      <li
        v-for="ch in filteredChapters"
        :key="ch.id"
        class="chapter-item"
        :class="{ 'chapter-item--read': ch.isRead, 'chapter-item--announcement': isAnnouncement(ch.title, ch.slug) }"
      >
        <button class="chapter-item__button" @click="openChapter(ch)">
          <span class="chapter-item__title">{{ ch.title }}</span>
          <span
            v-if="hasMultipleBooks && ch.volumeId"
            class="chapter-item__book"
            :title="`Livre ${bookLabels.get(ch.volumeId)?.slice(1) ?? ''}`"
          >{{ bookLabels.get(ch.volumeId) }}</span>
          <span v-if="isAnnouncement(ch.title, ch.slug)" class="chapter-item__kind">Annonce</span>
          <span class="chapter-item__date">{{ formatDate(ch.publishedAt) }}</span>
          <span v-if="ch.content" class="chapter-item__offline" title="Disponible hors ligne">📥</span>
        </button>
      </li>
    </ul>

    <div v-if="!loading && !refreshing && chapters.length === 0" class="chapter-list__empty">
      Aucun chapitre trouvé. Vérifiez votre connexion et réessayez.
    </div>
    <div v-else-if="!loading && !refreshing && filteredChapters.length === 0" class="chapter-list__empty">
      {{ typeFilter === 'announcements' ? 'Aucune annonce ne correspond à ces filtres.' : 'Aucun chapitre ne correspond à ces filtres.' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { db, type FictionRecord, type ChapterRecord } from '@/db'
import { isAnnouncement } from '@/core/models/chapter'
import { useLibraryStore } from '@/stores/libraryStore'
import { useReaderStore } from '@/stores/readerStore'

const props = defineProps<{ fictionDbId: number }>()

const router = useRouter()
const library = useLibraryStore()
const reader = useReaderStore()

const fiction = ref<FictionRecord | null>(null)
const chapters = ref<ChapterRecord[]>([])
const loading = ref(true)
const refreshing = ref(false)
const downloading = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')
const readFilter = ref<'all' | 'unread' | 'read'>('all')
const typeFilter = ref<'all' | 'chapters' | 'announcements'>('chapters')

const allOffline = computed(() =>
  chapters.value.length > 0 && chapters.value.every(c => !!c.content)
)

const sortKey = `chapter-sort-desc-${props.fictionDbId}`
const sortDesc = ref(localStorage.getItem(sortKey) === 'true')
watch(sortDesc, v => localStorage.setItem(sortKey, String(v)))
const sortedChapters = computed(() =>
  [...chapters.value].sort((a, b) => {
    const comparison = a.order - b.order
    return sortDesc.value ? -comparison : comparison
  })
)
const bookLabels = computed(() => {
  const volumeIds = [...new Set(
    [...chapters.value]
      .sort((a, b) => a.order - b.order)
      .map(chapter => chapter.volumeId)
      .filter((volumeId): volumeId is string => !!volumeId)
  )]
  return new Map(volumeIds.map((volumeId, index) => [volumeId, `B${index + 1}`]))
})
const hasMultipleBooks = computed(() => bookLabels.value.size > 1)
const announcementCount = computed(() => chapters.value.filter(c => isAnnouncement(c.title, c.slug)).length)
const storyChapterCount = computed(() => chapters.value.length - announcementCount.value)
const unreadCount = computed(() => chapters.value.filter(c => !c.isRead && !isAnnouncement(c.title, c.slug)).length)
const typeFilterOptions = computed(() => [
  { value: 'chapters' as const, label: 'Chapitres', count: storyChapterCount.value },
  { value: 'announcements' as const, label: 'Annonces', count: announcementCount.value },
  { value: 'all' as const, label: 'Tout', count: chapters.value.length },
])
const typeFilteredChapters = computed(() => sortedChapters.value.filter(chapter => {
  if (typeFilter.value === 'chapters') return !isAnnouncement(chapter.title, chapter.slug)
  if (typeFilter.value === 'announcements') return isAnnouncement(chapter.title, chapter.slug)
  return true
}))
const readFilterOptions = computed(() => [
  { value: 'all' as const, label: 'Tous', count: typeFilteredChapters.value.length },
  { value: 'unread' as const, label: 'Non lus', count: typeFilteredChapters.value.filter(c => !c.isRead).length },
  { value: 'read' as const, label: 'Lus', count: typeFilteredChapters.value.filter(c => c.isRead).length },
])
const filteredChapters = computed(() => {
  const query = searchQuery.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr')
  return typeFilteredChapters.value.filter(chapter => {
    const title = chapter.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr')
    const matchesReadStatus = readFilter.value === 'all'
      || (readFilter.value === 'read' ? chapter.isRead : !chapter.isRead)
    return title.includes(query) && matchesReadStatus
  })
})

onMounted(async () => {
  fiction.value = await db.fictions.get(props.fictionDbId) ?? null
  chapters.value = await library.getChapters(props.fictionDbId)
  loading.value = false
  // Auto-fetch chapters on first open
  if (chapters.value.length === 0 && fiction.value) {
    await refresh()
  }
})

async function markAllRead() {
  if (!fiction.value?.id) return
  await library.markAllAsRead(fiction.value.id)
  chapters.value = chapters.value.map(c => ({ ...c, isRead: true }))
  fiction.value = { ...fiction.value, unreadCount: 0 }
}

async function startDownload() {
  if (!fiction.value) return
  downloading.value = true
  error.value = null
  try {
    const { done, skipped } = await library.downloadAllChapters(fiction.value)
    chapters.value = await library.getChapters(props.fictionDbId)
    if (skipped > 0) alert(`${done} chapitres téléchargés, ${skipped} échoués.`)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    downloading.value = false
  }
}

function cancelDownload() {
  library.abortDownload()
}

async function refresh() {
  if (!fiction.value) return
  refreshing.value = true
  error.value = null
  try {
    const existingIds = new Set(chapters.value.map(chapter => chapter.chapterId))
    const count = await library.refreshChapters(fiction.value)
    chapters.value = await library.getChapters(props.fictionDbId)
    if (count > 0) {
      const newChapters = chapters.value.filter(chapter => !existingIds.has(chapter.chapterId))
      const newAnnouncements = newChapters.filter(chapter => isAnnouncement(chapter.title, chapter.slug)).length
      const newStoryChapters = newChapters.length - newAnnouncements
      const messages = [
        newStoryChapters > 0 ? `${newStoryChapters} nouveau(x) chapitre(s)` : '',
        newAnnouncements > 0 ? `${newAnnouncements} nouvelle(s) annonce(s)` : '',
      ].filter(Boolean)
      alert(`${messages.join(' et ')} ajouté(e)(s) !`)
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    refreshing.value = false
  }
}

async function openChapter(ch: ChapterRecord) {
  if (!fiction.value) return
  await reader.openChapter(fiction.value, ch)
  router.push(`/fiction/${props.fictionDbId}/read/${ch.chapterId}`)
}

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}
</script>

<style scoped>
.chapter-list {
  max-width: 700px;
  margin: 0 auto;
  padding: 16px;
}
.chapter-list__header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.btn-back {
  background: none;
  border: none;
  font-size: 0.95rem;
  cursor: pointer;
  color: var(--color-accent);
  padding: 0;
  align-self: flex-start;
}
.chapter-list__fiction-info {
  display: flex;
  gap: 12px;
  align-items: center;
}
.chapter-list__cover {
  width: 50px;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 4px;
}
.chapter-list__title {
  margin: 0;
  font-size: 1.1rem;
}
.chapter-list__author {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.chapter-list__toolbar {
  display: flex;
  justify-content: flex-end;
}
.chapter-list__toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.chapter-list__filters {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}
.chapter-list__filters input {
  width: 100%;
  min-height: 44px;
  padding: 9px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}
.chapter-list__read-filter {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}
.chapter-list__read-filter button {
  min-height: 38px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text);
  white-space: nowrap;
  cursor: pointer;
}
.chapter-list__read-filter button.is-active {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: #fff;
}
.chapter-list__type-filter button:not(.is-active) {
  background: var(--color-surface);
}
.chapter-list__read-filter span {
  margin-left: 4px;
  opacity: 0.8;
}
.btn-refresh {
  font-size: 0.85rem;
  padding: 7px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: none;
  cursor: pointer;
  color: var(--color-text);
}
.btn-download {
  font-size: 0.85rem;
  padding: 7px 14px;
  border: none;
  border-radius: 8px;
  background: var(--color-accent);
  color: #fff;
  cursor: pointer;
}
.btn-download:disabled {
  opacity: 0.55;
  cursor: default;
}
.btn-mark-read {
  font-size: 0.85rem;
  padding: 7px 14px;
  border: 1px solid var(--color-accent);
  border-radius: 8px;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
}
.btn-mark-read:disabled {
  opacity: 0.4;
  cursor: default;
}
.btn-sort {
  font-size: 0.85rem;
  padding: 7px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: none;
  cursor: pointer;
  color: var(--color-text);
  white-space: nowrap;
}
.chapter-list__loading {
  text-align: center;
  padding: 40px;
  color: var(--color-text-muted);
}
.chapter-list__error {
  margin: 16px 0;
  padding: 12px 16px;
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 8px;
  font-size: 0.9rem;
  word-break: break-word;
}
.chapter-list__empty {
  text-align: center;
  padding: 40px;
  color: var(--color-text-muted);
}
.chapter-list__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.chapter-item {
  border-radius: 8px;
  transition: background 0.1s;
}
.chapter-item:hover,
.chapter-item:focus-within {
  background: var(--color-surface-hover);
}
.chapter-item__button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.chapter-item--read .chapter-item__title {
  color: var(--color-text-muted);
}
.chapter-item--announcement {
  border-left: 3px solid var(--color-accent);
}
.chapter-item__title {
  flex: 1;
  font-size: 0.9rem;
}
.chapter-item__kind {
  flex-shrink: 0;
  padding: 3px 7px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-accent);
  font-size: 0.7rem;
  font-weight: 600;
}
.chapter-item__book {
  flex-shrink: 0;
  min-width: 30px;
  padding: 3px 6px;
  border-radius: 4px;
  background: var(--color-surface-hover);
  color: var(--color-text-muted);
  font-size: 0.7rem;
  font-weight: 700;
  text-align: center;
}
.chapter-item__date {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.chapter-item__offline {
  font-size: 0.8rem;
}
</style>
