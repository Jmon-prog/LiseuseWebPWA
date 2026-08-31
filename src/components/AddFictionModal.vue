<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <h2 class="modal__title">Ajouter une fiction</h2>

      <div class="modal__field">
        <label for="url-input">URL de la fiction ou d'un chapitre</label>
        <input
          id="url-input"
          v-model="url"
          type="url"
          placeholder="https://www.royalroad.com/fiction/..."
          :disabled="step !== 'input'"
          @keydown.enter="preview"
        />
      </div>

      <!-- Prévisualisation -->
      <div v-if="step === 'preview' || step === 'confirm'" class="modal__preview">
        <img :src="previewCover" alt="Couverture" class="modal__cover" />
        <div class="modal__meta">
          <p class="modal__fiction-title">{{ previewTitle }}</p>
          <p class="modal__fiction-author">{{ previewAuthor }}</p>
        </div>
      </div>

      <p v-if="errorMsg" class="modal__error">{{ errorMsg }}</p>

      <div class="modal__actions">
        <button class="btn btn--ghost" @click="$emit('close')">Annuler</button>

        <button
          v-if="step === 'input'"
          class="btn btn--primary"
          :disabled="!url.trim() || loading"
          @click="preview"
        >
          {{ loading ? 'Chargement…' : 'Aperçu' }}
        </button>

        <button
          v-if="step === 'preview'"
          class="btn btn--primary"
          :disabled="loading"
          @click="confirm"
        >
          {{ loading ? 'Ajout…' : 'Ajouter à la bibliothèque' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { resolveService } from '@/sources'
import { useLibraryStore } from '@/stores/libraryStore'
import type { RoyalRoadService } from '@/sources/royalroad/RoyalRoadService'

const emit = defineEmits<{ close: []; added: [] }>()

const library = useLibraryStore()

type Step = 'input' | 'preview' | 'confirm'
const step = ref<Step>('input')
const url = ref('')
const loading = ref(false)
const errorMsg = ref('')
const previewCover = ref('')
const previewTitle = ref('')
const previewAuthor = ref('')

async function preview() {
  errorMsg.value = ''
  const service = resolveService(url.value)
  if (!service) {
    errorMsg.value = 'URL non reconnue. Seul Royal Road est supporté pour l\'instant.'
    return
  }

  const canonical = service.normalizeFictionUrl(url.value)!

  // Construire la cover immédiatement sans fetch
  const rr = service as RoyalRoadService
  const m = canonical.match(/fiction\/(\d+)\/([\w-]+)/)
  if (m) previewCover.value = rr.buildCoverUrl(m[1], m[2])

  loading.value = true
  try {
    const details = await service.getFictionDetails(canonical)
    previewTitle.value = details.title
    previewAuthor.value = details.author
    previewCover.value = details.coverUrl  // URL réelle avec ?time=
    step.value = 'preview'
  } catch (e: any) {
    errorMsg.value = e.message ?? 'Erreur lors de la récupération des informations.'
  } finally {
    loading.value = false
  }
}

async function confirm() {
  loading.value = true
  errorMsg.value = ''
  try {
    await library.addFiction(url.value)
    emit('added')
    emit('close')
  } catch (e: any) {
    errorMsg.value = e.message ?? 'Erreur lors de l\'ajout.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.modal {
  background: var(--color-surface);
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.modal__title {
  margin: 0;
  font-size: 1.2rem;
}
.modal__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.modal__field label {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.modal__field input {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 0.95rem;
  background: var(--color-bg);
  color: var(--color-text);
  outline: none;
}
.modal__field input:focus {
  border-color: var(--color-accent);
}
.modal__preview {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.modal__cover {
  width: 70px;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 4px;
  background: #ddd;
  flex-shrink: 0;
}
.modal__fiction-title {
  font-weight: 600;
  margin: 0 0 4px;
}
.modal__fiction-author {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0;
}
.modal__error {
  color: #e53935;
  font-size: 0.85rem;
  margin: 0;
}
.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.btn {
  padding: 9px 18px;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  border: none;
  font-weight: 500;
  transition: opacity 0.15s;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn--primary {
  background: var(--color-accent);
  color: #fff;
}
.btn--ghost {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
</style>
