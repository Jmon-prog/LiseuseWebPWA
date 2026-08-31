<template>
  <div
    class="reader"
    :data-theme="settings.theme"
    :style="readerStyle"
  >
    <!-- Barre de navigation -->
    <nav class="reader__nav" :class="{ 'reader__nav--hidden': navHidden }">
      <button class="reader__nav-btn" @click="router.back()">←</button>
      <span class="reader__nav-title">{{ currentTitle }}</span>
      <button class="reader__nav-btn" @click="showPanel = !showPanel">Aa</button>
    </nav>

    <main ref="epubEl" class="reader__content">
      <div v-if="loading" class="reader__loading">Ouverture de l’EPUB…</div>
      <div v-else-if="error" class="reader__error">{{ error }}</div>
    </main>

    <!-- Footer navigation -->
    <footer class="reader__footer">
      <button
        class="reader__nav-btn"
        :disabled="currentChapterIdx <= 0 || loading"
        @click="goPrev"
      >← Précédent</button>

      <button
        class="reader__nav-btn"
        @click="router.push(`/fiction/${fictionDbId}/chapters`)"
      >Chapitres</button>

      <button
        class="reader__nav-btn"
        :disabled="currentChapterIdx >= allChapters.length - 1 || loading"
        @click="goNext"
      >Suivant →</button>
    </footer>

    <!-- Panneau réglages -->
    <transition name="slide-up">
      <div v-if="showPanel" class="reader__panel">
        <h3>Affichage</h3>

        <label>Thème</label>
        <div class="reader__theme-btns">
          <button
            v-for="t in (['light', 'dark', 'sepia'] as const)"
            :key="t"
            class="reader__theme-btn"
            :class="{ active: settings.theme === t }"
            @click="settings.theme = t"
          >{{ t }}</button>
        </div>

        <label>Police</label>
        <select v-model="settings.fontFamily">
          <option value="serif">Serif</option>
          <option value="sans-serif">Sans-serif</option>
          <option value="monospace">Monospace</option>
        </select>

        <label>Taille ({{ settings.fontSize }}px)</label>
        <input type="range" min="14" max="30" v-model.number="settings.fontSize" />

        <label>Interligne ({{ settings.lineHeight }})</label>
        <input type="range" min="1.2" max="2.5" step="0.1" v-model.number="settings.lineHeight" />

        <label>Largeur colonne ({{ settings.columnWidth }}px)</label>
        <input type="range" min="300" max="900" step="20" v-model.number="settings.columnWidth" />

      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { db, type FictionRecord, type ChapterRecord } from '@/db'
import { useReaderStore } from '@/stores/readerStore'
import { useSettingsStore } from '@/stores/settingsStore'
import ePub, { type Book, type Location, type Rendition } from 'epubjs'
import { createEpub, getEpubChapterHref } from '@/core/services/epub'

const props = defineProps<{ fictionDbId: number; chapterId: string }>()

const router = useRouter()
const reader = useReaderStore()
const settings = useSettingsStore()

const epubEl = ref<HTMLElement | null>(null)
const showPanel = ref(false)
const navHidden = ref(false)

const fiction = ref<FictionRecord | null>(null)
const allChapters = ref<ChapterRecord[]>([])
const currentChapterIdx = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)

const currentChapter = computed(() => allChapters.value[currentChapterIdx.value] ?? null)
const currentTitle = computed(() => currentChapter.value?.title ?? '')

const readerStyle = computed(() => ({
  fontFamily: settings.fontFamily,
  fontSize: settings.fontSize + 'px',
  lineHeight: settings.lineHeight,
  '--column-width': settings.columnWidth + 'px',
  '--margin-x': settings.marginX + 'px',
}))

async function markRead(ch: ChapterRecord) {
  await db.chapters.update(ch.id!, { isRead: true })
  const unread = await db.chapters
    .where('fictionDbId').equals(props.fictionDbId)
    .and(c => !c.isRead)
    .count()
  await db.fictions.update(props.fictionDbId, {
    lastReadChapterId: ch.chapterId,
    unreadCount: unread,
  })
}

let book: Book | null = null
let rendition: Rendition | null = null

function applyReaderSettings() {
  if (!rendition) return
  rendition.themes.override('font-family', settings.fontFamily)
  rendition.themes.override('font-size', `${settings.fontSize}px`)
  rendition.themes.override('line-height', String(settings.lineHeight))
}

async function openEpub(chapterId: string) {
  const f = fiction.value
  const target = allChapters.value.find(chapter => chapter.chapterId === chapterId)
  if (!f || !target || !epubEl.value) return

  if (!target.content) {
    await reader.downloadChapter(target, f)
    allChapters.value = await db.chapters.where('fictionDbId').equals(props.fictionDbId).sortBy('order')
  }

  const href = getEpubChapterHref(chapterId, allChapters.value)
  if (!href) throw new Error('Le chapitre choisi ne peut pas être ajouté à l’EPUB.')
  const targetIndex = allChapters.value.findIndex(chapter => chapter.chapterId === chapterId)
  book?.destroy()
  book = ePub(await createEpub(f, allChapters.value).arrayBuffer())
  rendition = book.renderTo(epubEl.value, { width: '100%', height: '100%', flow: 'scrolled-doc' })
  rendition.on('relocated', (location: Location) => {
    const index = allChapters.value.findIndex(chapter => getEpubChapterHref(chapter.chapterId, allChapters.value) === location.start.href)
    if (index === -1) return
    currentChapterIdx.value = index
    void markRead(allChapters.value[index])
    router.replace(`/fiction/${props.fictionDbId}/read/${allChapters.value[index].chapterId}`)
  })
  applyReaderSettings()
  currentChapterIdx.value = targetIndex
  await rendition.display(href)
  await markRead(allChapters.value[targetIndex])
}

// ── Montage ────────────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    settings.applyTheme()
    fiction.value = await db.fictions.get(props.fictionDbId) ?? null
    if (!fiction.value) throw new Error('Fiction introuvable')
    allChapters.value = await db.chapters.where('fictionDbId').equals(props.fictionDbId).sortBy('order')
    await nextTick()
    await openEpub(props.chapterId)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
})

watch([() => settings.theme, () => settings.fontFamily, () => settings.fontSize, () => settings.lineHeight], () => {
  settings.applyTheme()
  applyReaderSettings()
})

watch(() => props.chapterId, async chapterId => {
  if (!loading.value && chapterId !== currentChapter.value?.chapterId) await openEpub(chapterId)
})

onBeforeUnmount(() => {
  book?.destroy()
})

// ── Navigation ─────────────────────────────────────────────────────────────

async function goPrev() {
  const idx = currentChapterIdx.value
  if (idx <= 0) return
  await openEpub(allChapters.value[idx - 1].chapterId)
}

async function goNext() {
  const idx = currentChapterIdx.value
  if (idx >= allChapters.value.length - 1) return
  await openEpub(allChapters.value[idx + 1].chapterId)
}
</script>

<style scoped>
.reader {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--reader-bg);
  color: var(--reader-text);
  display: flex;
  flex-direction: column;
  /* Scroll natif fluide sur iOS */
  -webkit-overflow-scrolling: touch;
}
.reader__nav {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  /* Encoche / Dynamic Island */
  padding: max(10px, env(safe-area-inset-top)) 16px 10px;
  background: var(--reader-bg);
  border-bottom: 1px solid var(--color-border);
  z-index: 10;
  transition: transform 0.25s;
}
.reader__nav--hidden {
  transform: translateY(-100%);
}
.reader__nav-title {
  flex: 1;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reader__nav-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 6px 10px;
  border-radius: 6px;
  color: var(--reader-text);
  white-space: nowrap;
}
.reader__nav-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.reader__content {
  flex: 1;
  padding: var(--margin-x);
}
.reader__chapter {
  margin-bottom: 0;
}
.reader__chapter-title {
  max-width: var(--column-width);
  margin: 32px auto 16px;
  font-size: 1.2rem;
  font-weight: 700;
  opacity: 0.75;
}
.reader__chapter-sep {
  max-width: var(--column-width);
  margin: 48px auto;
  border-top: 2px dashed var(--color-border);
}
.reader__body {
  max-width: var(--column-width);
  margin: 0 auto;
  padding-bottom: 8px;
}
.reader__loading,
.reader__error {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-muted);
}
.reader__end {
  text-align: center;
  padding: 40px 20px 80px;
  color: var(--color-text-muted);
  font-style: italic;
}
.reader__sentinel {
  height: 1px;
}
.reader__progress {
  position: fixed;
  bottom: 0;
  left: 0;
  height: 3px;
  background: var(--color-accent);
  transition: width 0.1s linear;
  z-index: 20;
}
.reader__footer {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  padding: 12px 16px max(12px, env(safe-area-inset-bottom));
  background: var(--reader-bg);
  border-top: 1px solid var(--color-border);
}
.reader__panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-surface);
  border-radius: 16px 16px 0 0;
  padding: 20px 20px max(32px, env(safe-area-inset-bottom));
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
}
.reader__panel h3 {
  margin: 0;
}
.reader__panel label {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin-top: 4px;
}
.reader__panel select,
.reader__panel input[type="range"] {
  width: 100%;
}
.reader__theme-btns {
  display: flex;
  gap: 8px;
}
.reader__theme-btn {
  flex: 1;
  padding: 7px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: none;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--color-text);
  text-transform: capitalize;
}
.reader__theme-btn.active {
  border-color: var(--color-accent);
  color: var(--color-accent);
  font-weight: 600;
}
.btn-download {
  margin-top: 8px;
  padding: 10px;
  background: var(--color-accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
}
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.25s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
