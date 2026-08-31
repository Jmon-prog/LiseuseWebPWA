<template>
  <div
    class="reader"
    :data-theme="settings.theme"
    :style="readerStyle"
    @scroll.passive="onScroll"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
    ref="readerEl"
  >
    <!-- Barre de navigation -->
    <nav class="reader__nav" :class="{ 'reader__nav--hidden': navHidden }">
      <button class="reader__nav-btn" @click="router.back()">←</button>
      <span class="reader__nav-title">{{ currentTitle }}</span>
      <button class="reader__nav-btn" @click="showPanel = !showPanel">Aa</button>
    </nav>

    <!-- Flux de chapitres -->
    <main class="reader__content" @click.self="navHidden = !navHidden">
      <article
        v-for="item in loadedChapters"
        :key="item.chapter.chapterId"
        :data-chapter-id="item.chapter.chapterId"
        class="reader__chapter"
      >
        <h2 class="reader__chapter-title">{{ item.chapter.title }}</h2>
        <div v-if="item.loading" class="reader__loading">Chargement…</div>
        <div v-else-if="item.error" class="reader__error">{{ item.error }}</div>
        <div v-else class="reader__body" v-html="item.html" />
        <div class="reader__chapter-sep" />
      </article>

      <div v-if="loadingNext" class="reader__loading">Chargement du chapitre suivant…</div>
      <p v-else-if="noMoreChapters" class="reader__end">— Fin —</p>

      <!-- Sentinel IntersectionObserver -->
      <div ref="sentinelEl" class="reader__sentinel" />
    </main>

    <!-- Barre de progression -->
    <div class="reader__progress" :style="{ width: progressPct + '%' }" />

    <!-- Footer navigation -->
    <footer class="reader__footer">
      <button
        class="reader__nav-btn"
        :disabled="currentChapterIdx <= 0"
        @click="goPrev"
      >← Précédent</button>

      <button
        class="reader__nav-btn"
        @click="router.push(`/fiction/${fictionDbId}/chapters`)"
      >Chapitres</button>

      <button
        class="reader__nav-btn"
        :disabled="currentChapterIdx >= allChapters.length - 1"
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

        <button
          v-if="currentChapter"
          class="btn-download"
          @click="downloadCurrent"
        >
          {{ currentChapter.content ? '✓ Disponible hors ligne' : '📥 Télécharger ce chapitre' }}
        </button>
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
import { resolveService } from '@/sources'

interface LoadedChapter {
  chapter: ChapterRecord
  html: string
  loading: boolean
  error: string | null
}

const props = defineProps<{ fictionDbId: number; chapterId: string }>()

const router = useRouter()
const reader = useReaderStore()
const settings = useSettingsStore()

const readerEl = ref<HTMLElement | null>(null)
const sentinelEl = ref<HTMLElement | null>(null)
const showPanel = ref(false)
const navHidden = ref(false)
const lastScrollY = ref(0)
const progressPct = ref(0)
const loadingNext = ref(false)

const fiction = ref<FictionRecord | null>(null)
const allChapters = ref<ChapterRecord[]>([])
const loadedChapters = ref<LoadedChapter[]>([])
const currentChapterIdx = ref(0)

const currentChapter = computed(() => allChapters.value[currentChapterIdx.value] ?? null)
const currentTitle = computed(() => currentChapter.value?.title ?? '')
const nextLoadedIdx = computed(() => {
  if (loadedChapters.value.length === 0) return -1
  const lastLoaded = loadedChapters.value[loadedChapters.value.length - 1]
  return allChapters.value.findIndex(c => c.chapterId === lastLoaded.chapter.chapterId)
})
const noMoreChapters = computed(() => nextLoadedIdx.value >= allChapters.value.length - 1)

const readerStyle = computed(() => ({
  fontFamily: settings.fontFamily,
  fontSize: settings.fontSize + 'px',
  lineHeight: settings.lineHeight,
  '--column-width': settings.columnWidth + 'px',
  '--margin-x': settings.marginX + 'px',
}))

// ── Chargement HTML ────────────────────────────────────────────────────────

async function fetchHtml(ch: ChapterRecord): Promise<string> {
  if (ch.content) return ch.content
  const f = fiction.value
  if (!f) throw new Error('Fiction introuvable')
  const service = resolveService(f.url)
  if (!service) throw new Error('Service source introuvable')
  const content = await service.getChapterContent(ch.url)
  return content.html
}

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

async function appendChapter(ch: ChapterRecord) {
  loadedChapters.value.push({ chapter: ch, html: '', loading: true, error: null })
  const idx = loadedChapters.value.length - 1
  try {
    loadedChapters.value[idx].html = await fetchHtml(ch)
  } catch (e: unknown) {
    loadedChapters.value[idx].error = e instanceof Error ? e.message : String(e)
  } finally {
    loadedChapters.value[idx].loading = false
  }
}

async function loadNext() {
  if (loadingNext.value || noMoreChapters.value) return
  loadingNext.value = true
  try {
    const next = allChapters.value[nextLoadedIdx.value + 1]
    if (next) await appendChapter(next)
  } finally {
    loadingNext.value = false
  }
}

// ── IntersectionObserver ───────────────────────────────────────────────────

let sentinelObserver: IntersectionObserver | null = null
let chapterObserver: IntersectionObserver | null = null

function setupSentinel() {
  if (!sentinelEl.value) return
  sentinelObserver = new IntersectionObserver(
    entries => { if (entries[0].isIntersecting) loadNext() },
    { rootMargin: '300px' }
  )
  sentinelObserver.observe(sentinelEl.value)
}

function observeChapterHeadings() {
  chapterObserver?.disconnect()
  chapterObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = (entry.target.closest('[data-chapter-id]') as HTMLElement | null)
            ?.dataset.chapterId
          if (!id) continue
          const idx = allChapters.value.findIndex(c => c.chapterId === id)
          if (idx !== -1) {
            currentChapterIdx.value = idx
            void markRead(allChapters.value[idx])
            router.replace(`/fiction/${props.fictionDbId}/read/${id}`)
          }
        }
      }
    },
    { threshold: 0.15 }
  )
  nextTick(() => {
    readerEl.value
      ?.querySelectorAll<HTMLElement>('.reader__chapter-title')
      .forEach(el => chapterObserver!.observe(el))
  })
}

watch(() => loadedChapters.value.length, observeChapterHeadings)

// ── Montage ────────────────────────────────────────────────────────────────

onMounted(async () => {
  settings.applyTheme()
  fiction.value = await db.fictions.get(props.fictionDbId) ?? null
  if (!fiction.value) return

  allChapters.value = await db.chapters
    .where('fictionDbId').equals(props.fictionDbId)
    .sortBy('order')

  const startIdx = allChapters.value.findIndex(c => c.chapterId === props.chapterId)
  if (startIdx === -1) return
  currentChapterIdx.value = startIdx

  await appendChapter(allChapters.value[startIdx])
  await markRead(allChapters.value[startIdx])

  // Restaurer position scroll
  if (fiction.value.lastReadChapterId === props.chapterId && fiction.value.lastReadScrollY) {
    await nextTick()
    setTimeout(() => readerEl.value?.scrollTo({ top: fiction.value!.lastReadScrollY }), 80)
  }

  setupSentinel()
})

watch(() => settings.theme, () => settings.applyTheme())

onBeforeUnmount(() => {
  sentinelObserver?.disconnect()
  chapterObserver?.disconnect()
  if (readerEl.value) reader.saveScrollPosition(readerEl.value.scrollTop)
})

// ── Touch / Swipe ───────────────────────────────────────────────────────

const touchStart = { x: 0, y: 0 }

function onTouchStart(e: TouchEvent) {
  touchStart.x = e.touches[0].clientX
  touchStart.y = e.touches[0].clientY
}

function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchStart.x
  const dy = e.changedTouches[0].clientY - touchStart.y
  // Swipe horizontal uniquement (plus horizontal que vertical)
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
  if (dx < 0) goNext()   // swipe ← = chapitre suivant
  else goPrev()           // swipe → = chapitre précédent
}

// ── Scroll ─────────────────────────────────────────────────────────────────

function onScroll() {
  const el = readerEl.value
  if (!el) return
  const sy = el.scrollTop
  navHidden.value = sy > lastScrollY.value && sy > 60
  lastScrollY.value = sy
  const max = el.scrollHeight - el.clientHeight
  progressPct.value = max > 0 ? (sy / max) * 100 : 0
}

// ── Navigation ─────────────────────────────────────────────────────────────

function scrollToChapterId(chapterId: string) {
  const el = readerEl.value?.querySelector(`[data-chapter-id="${chapterId}"]`) as HTMLElement | null
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' })
    return true
  }
  return false
}

async function goPrev() {
  const idx = currentChapterIdx.value
  if (idx <= 0) return
  const ch = allChapters.value[idx - 1]
  // Si déjà chargé dans le DOM, on scrolle
  if (!scrollToChapterId(ch.chapterId)) {
    // Sinon navigation classique
    router.push(`/fiction/${props.fictionDbId}/read/${ch.chapterId}`)
  } else {
    await markRead(ch)
  }
}

async function goNext() {
  const idx = currentChapterIdx.value
  if (idx >= allChapters.value.length - 1) return
  const ch = allChapters.value[idx + 1]
  // Charger si pas encore dans le DOM
  const isLoaded = loadedChapters.value.some(i => i.chapter.chapterId === ch.chapterId)
  if (!isLoaded) await appendChapter(ch)
  await nextTick()
  scrollToChapterId(ch.chapterId)
  await markRead(ch)
}

async function downloadCurrent() {
  const ch = currentChapter.value
  if (!ch || !fiction.value) return
  await reader.downloadChapter(ch, fiction.value)
  // Refresh content in loaded list
  const item = loadedChapters.value.find(i => i.chapter.chapterId === ch.chapterId)
  if (item) {
    const updated = await db.chapters.get(ch.id!)
    if (updated?.content) item.chapter = updated
  }
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
