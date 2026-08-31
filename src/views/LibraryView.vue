<template>
  <div class="library">
    <header class="library__header">
      <h1 class="library__title">Ma bibliothèque</h1>
      <div class="library__actions">
        <button class="btn-icon" title="Paramètres" @click="router.push('/settings')">⚙️</button>
        <button class="btn-add" @click="showModal = true">+ Ajouter</button>
      </div>
    </header>

    <div v-if="library.fictions.length === 0" class="library__empty">
      <p>Votre bibliothèque est vide.</p>
      <button class="btn-add" @click="showModal = true">Ajouter une fiction</button>
    </div>

    <template v-else>
      <div class="library__toolbar">
        <div class="sort-tabs">
          <button
            v-for="opt in sortOptions"
            :key="opt.value"
            class="sort-tab"
            :class="{ active: sortKey === opt.value }"
            @click="sortKey = opt.value"
          >{{ opt.label }}</button>
        </div>
        <button class="sort-dir" :title="sortAsc ? 'Croissant' : 'Décroissant'" @click="sortAsc = !sortAsc">
          {{ sortAsc ? '↑' : '↓' }}
        </button>
      </div>

      <div class="library__grid">
        <FictionCard
          v-for="fiction in sortedFictions"
          :key="fiction.id"
          :fiction="fiction"
          @click="router.push(`/fiction/${fiction.id}/chapters`)"
          @remove="confirmRemove(fiction)"
        />
      </div>
    </template>

    <AddFictionModal
      v-if="showModal"
      @close="showModal = false"
      @added="library.loadLibrary()"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLibraryStore } from '@/stores/libraryStore'
import type { FictionRecord } from '@/db'
import FictionCard from '@/components/FictionCard.vue'
import AddFictionModal from '@/components/AddFictionModal.vue'

const router = useRouter()
const library = useLibraryStore()
const showModal = ref(false)

onMounted(() => library.loadLibrary())

type SortKey = 'unread' | 'title' | 'author' | 'updated'

const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'unread',   label: '🔔 Non lus' },
  { value: 'updated',  label: '🕐 Date' },
  { value: 'title',    label: 'A–Z Titre' },
  { value: 'author',   label: 'A–Z Auteur' },
]

const sortKey = ref<SortKey>('unread')
const sortAsc = ref(false)

const sortedFictions = computed(() => {
  const list = [...library.fictions]
  list.sort((a, b) => {
    let cmp = 0
    if (sortKey.value === 'unread')  cmp = b.unreadCount - a.unreadCount || b.lastUpdatedAt - a.lastUpdatedAt
    if (sortKey.value === 'updated') cmp = b.lastUpdatedAt - a.lastUpdatedAt
    if (sortKey.value === 'title')   cmp = a.title.localeCompare(b.title, 'fr')
    if (sortKey.value === 'author')  cmp = (a.author ?? '').localeCompare(b.author ?? '', 'fr')
    return sortAsc.value ? -cmp : cmp
  })
  return list
})

function confirmRemove(fiction: FictionRecord) {
  if (confirm(`Supprimer « ${fiction.title} » et tous ses chapitres ?`)) {
    library.removeFiction(fiction.id!)
  }
}
</script>

<style scoped>
.library {
  padding: 16px;
  max-width: 900px;
  margin: 0 auto;
}
.library__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.library__title {
  margin: 0;
  font-size: 1.4rem;
}
.library__actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.library__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.library__toolbar::-webkit-scrollbar { display: none; }
.sort-tabs {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.sort-tab {
  padding: 5px 12px;
  border-radius: 999px;
  border: 1.5px solid var(--color-border, #ddd);
  background: transparent;
  color: var(--color-text);
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
}
.sort-tab.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}
.sort-dir {
  flex-shrink: 0;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1.5px solid var(--color-border, #ddd);
  background: transparent;
  color: var(--color-text);
  font-size: 1rem;
  cursor: pointer;
}
.library__empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.library__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}
.btn-add {
  background: var(--color-accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}
.btn-icon {
  background: none;
  border: none;
  font-size: 1.3rem;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
}
</style>

