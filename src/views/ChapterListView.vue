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
          class="btn-download"
          :disabled="refreshing || downloading || exporting"
          @click="exportBook"
        >{{ exporting ? 'Création EPUB…' : allOffline ? '↻ Mettre à jour EPUB' : '📖 Exporter EPUB' }}</button>
        <button
          class="btn-mark-read"
          :disabled="refreshing || downloading || unreadCount === 0"
          @click="markAllRead"
          title="Marquer tout comme lu"
        >✓ Tout lu</button>
        <button class="btn-sort" @click="sortDesc = !sortDesc" :title="sortDesc ? 'Plus récent en premier' : 'Plus ancien en premier'">
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

    <ul v-else-if="chapters.length > 0" class="chapter-list__list">
      <li
        v-for="ch in sortedChapters"
        :key="ch.id"
        class="chapter-item"
        :class="{ 'chapter-item--read': ch.isRead }"
        @click="openChapter(ch)"
      >
        <span class="chapter-item__title">{{ ch.title }}</span>
        <span class="chapter-item__date">{{ formatDate(ch.publishedAt) }}</span>
        <span v-if="ch.content" class="chapter-item__offline" title="Disponible hors ligne">📥</span>
      </li>
    </ul>

    <div v-else-if="!loading && !refreshing" class="chapter-list__empty">
      Aucun chapitre trouvé. Vérifiez votre connexion et réessayez.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { db, type FictionRecord, type ChapterRecord } from '@/db'
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
const exporting = ref(false)
const error = ref<string | null>(null)

const allOffline = computed(() =>
  chapters.value.length > 0 && chapters.value.every(c => !!c.content)
)

const sortKey = `chapter-sort-desc-${props.fictionDbId}`
const sortDesc = ref(localStorage.getItem(sortKey) === 'true')
watch(sortDesc, v => localStorage.setItem(sortKey, String(v)))
const sortedChapters = computed(() =>
  [...chapters.value].sort((a, b) => sortDesc.value ? b.order - a.order : a.order - b.order)
)
const unreadCount = computed(() => chapters.value.filter(c => !c.isRead).length)

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

async function exportBook() {
  if (!fiction.value) return
  exporting.value = true
  error.value = null
  try {
    await library.exportEpub(fiction.value)
    chapters.value = await library.getChapters(props.fictionDbId)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    exporting.value = false
  }
}

async function refresh() {
  if (!fiction.value) return
  refreshing.value = true
  error.value = null
  try {
    const count = await library.refreshChapters(fiction.value)
    chapters.value = await library.getChapters(props.fictionDbId)
    if (count > 0) alert(`${count} nouveau(x) chapitre(s) ajouté(s) !`)
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
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.1s;
}
.chapter-item:hover {
  background: var(--color-surface-hover);
}
.chapter-item--read .chapter-item__title {
  color: var(--color-text-muted);
}
.chapter-item__title {
  flex: 1;
  font-size: 0.9rem;
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
