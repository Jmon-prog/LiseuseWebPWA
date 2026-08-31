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

    <main ref="readerEl" class="reader__content" @scroll.passive="onScroll">
      <article v-if="chapter" class="reader__chapter">
        <h2 class="reader__chapter-title">{{ chapter.title }}</h2>
        <div v-if="loading" class="reader__loading">Chargement…</div>
        <div v-else-if="error" class="reader__error">{{ error }}</div>
        <div v-else class="reader__body" v-html="chapterHtml" />
      </article>
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

const props = defineProps<{ fictionDbId: number; chapterId: string }>()

const router = useRouter()
const reader = useReaderStore()
const settings = useSettingsStore()

const readerEl = ref<HTMLElement | null>(null)
const showPanel = ref(false)
const navHidden = ref(false)
const lastScrollY = ref(0)

const fiction = ref<FictionRecord | null>(null)
const allChapters = ref<ChapterRecord[]>([])
const currentChapterIdx = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)
const chapterHtml = ref('')

const chapter = computed(() => allChapters.value[currentChapterIdx.value] ?? null)
const currentTitle = computed(() => chapter.value?.title ?? '')

const readerStyle = computed(() => ({
  fontFamily: settings.fontFamily,
  fontSize: `${settings.fontSize}px`,
  lineHeight: settings.lineHeight,
  '--column-width': `${settings.columnWidth}px`,
  '--margin-x': `${settings.marginX}px`,
}))

async function loadChapter(chapterId: string, restorePosition = false) {
  const f = fiction.value
  const target = allChapters.value.find(chapter => chapter.chapterId === chapterId)
  if (!f || !target) return
  loading.value = true
  error.value = null
  const targetIndex = allChapters.value.findIndex(chapter => chapter.chapterId === chapterId)
  try {
    chapterHtml.value = await reader.openChapter(f, target)
    currentChapterIdx.value = targetIndex
    await nextTick()
    readerEl.value?.scrollTo({ top: restorePosition ? f.lastReadScrollY ?? 0 : 0 })
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

// ── Montage ────────────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    settings.applyTheme()
    fiction.value = await db.fictions.get(props.fictionDbId) ?? null
    if (!fiction.value) throw new Error('Fiction introuvable')
    allChapters.value = await db.chapters.where('fictionDbId').equals(props.fictionDbId).sortBy('order')
    await loadChapter(props.chapterId, fiction.value.lastReadChapterId === props.chapterId)
  } finally {
    loading.value = false
  }
})

watch(() => settings.theme, () => settings.applyTheme())

watch(() => props.chapterId, async chapterId => {
  if (chapterId !== chapter.value?.chapterId) await loadChapter(chapterId)
})

onBeforeUnmount(() => {
  if (fiction.value?.id && readerEl.value) void reader.saveScrollPosition(fiction.value.id, readerEl.value.scrollTop)
})

// ── Navigation ─────────────────────────────────────────────────────────────

async function goPrev() {
  const idx = currentChapterIdx.value
  if (idx <= 0) return
  await goToChapter(allChapters.value[idx - 1].chapterId)
}

async function goNext() {
  const idx = currentChapterIdx.value
  if (idx >= allChapters.value.length - 1) return
  await goToChapter(allChapters.value[idx + 1].chapterId)
}

async function goToChapter(chapterId: string) {
  if (fiction.value?.id && readerEl.value) await reader.saveScrollPosition(fiction.value.id, readerEl.value.scrollTop)
  await router.push(`/fiction/${props.fictionDbId}/read/${chapterId}`)
}

function onScroll() {
  const element = readerEl.value
  if (!element) return
  navHidden.value = element.scrollTop > lastScrollY.value && element.scrollTop > 60
  lastScrollY.value = element.scrollTop
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
  overflow-y: auto;
  padding: var(--margin-x);
}
.reader__chapter-title,
.reader__body {
  max-width: var(--column-width);
  margin-left: auto;
  margin-right: auto;
}
.reader__chapter-title {
  margin-top: 32px;
  margin-bottom: 16px;
  font-size: 1.2rem;
}
.reader__body {
  padding-bottom: 32px;
}
.reader__loading,
.reader__error {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-muted);
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
