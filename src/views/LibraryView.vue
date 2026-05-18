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

    <div v-else class="library__grid">
      <FictionCard
        v-for="fiction in library.fictions"
        :key="fiction.id"
        :fiction="fiction"
        @click="router.push(`/fiction/${fiction.id}/chapters`)"
        @remove="confirmRemove(fiction)"
      />
    </div>

    <AddFictionModal
      v-if="showModal"
      @close="showModal = false"
      @added="library.loadLibrary()"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLibraryStore } from '@/stores/libraryStore'
import type { FictionRecord } from '@/db'
import FictionCard from '@/components/FictionCard.vue'
import AddFictionModal from '@/components/AddFictionModal.vue'

const router = useRouter()
const library = useLibraryStore()
const showModal = ref(false)

onMounted(() => library.loadLibrary())

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
  margin-bottom: 20px;
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
