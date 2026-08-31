<template>
  <div class="settings">
    <header class="settings__header">
      <button class="btn-back" @click="router.back()">← Retour</button>
      <h1>Paramètres</h1>
    </header>

    <section class="settings__section">
      <h2>Lecture</h2>
      <div class="settings__row">
        <label>Thème par défaut</label>
        <select v-model="settings.theme">
          <option value="light">Clair</option>
          <option value="dark">Sombre</option>
          <option value="sepia">Sépia</option>
        </select>
      </div>
      <div class="settings__row">
        <label>Police</label>
        <select v-model="settings.fontFamily">
          <option value="serif">Serif</option>
          <option value="sans-serif">Sans-serif</option>
          <option value="monospace">Monospace</option>
        </select>
      </div>
      <div class="settings__row">
        <label>Taille du texte — {{ settings.fontSize }}px</label>
        <input type="range" min="14" max="30" v-model.number="settings.fontSize" />
      </div>
      <div class="settings__row">
        <label>Interligne — {{ settings.lineHeight }}</label>
        <input type="range" min="1.2" max="2.5" step="0.1" v-model.number="settings.lineHeight" />
      </div>
      <div class="settings__row">
        <label>Largeur de colonne — {{ settings.columnWidth }}px</label>
        <input type="range" min="300" max="900" step="20" v-model.number="settings.columnWidth" />
      </div>
    </section>

    <section class="settings__section">
      <h2>Notifications</h2>
      <div class="settings__row">
        <label>Autoriser les notifications</label>
        <button class="btn-notify" @click="requestNotifPermission">
          {{ notifStatus }}
        </button>
      </div>
    </section>

    <section class="settings__section">
      <h2>Mise à jour</h2>
      <div class="settings__row">
        <label for="check-update">Version installée: {{ appVersion }}</label>
        <button id="check-update" class="btn-notify" :disabled="checkingUpdate" @click="checkForUpdate">
          {{ checkingUpdate ? 'Recherche…' : 'Rechercher' }}
        </button>
      </div>
      <p v-if="updateStatus" class="settings__about">{{ updateStatus }}</p>
    </section>

    <section class="settings__section">
      <h2>À propos</h2>
      <p class="settings__about">LiseuseWeb — PWA locale, aucune donnée envoyée à un serveur.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settingsStore'

const router = useRouter()
const settings = useSettingsStore()
const appVersion = __APP_VERSION__
const checkingUpdate = ref(false)
const updateStatus = ref('')

const notifStatus = ref(
  'Notification' in window
    ? Notification.permission === 'granted'
      ? '✓ Activées'
      : 'Activer'
    : 'Non supporté'
)

async function requestNotifPermission() {
  if (!('Notification' in window)) return
  const result = await Notification.requestPermission()
  notifStatus.value = result === 'granted' ? '✓ Activées' : 'Refusé'
}

async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) {
    updateStatus.value = 'Les mises à jour ne sont pas prises en charge par ce navigateur.'
    return
  }

  checkingUpdate.value = true
  updateStatus.value = ''
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) {
      updateStatus.value = 'Le service de mise à jour n’est pas encore installé.'
      return
    }

    await registration.update()
    const worker = registration.waiting ?? registration.installing
    if (!worker) {
      updateStatus.value = 'Vous utilisez déjà la dernière version.'
      return
    }

    if (worker.state !== 'installed') {
      updateStatus.value = 'Mise à jour trouvée. Téléchargement…'
      await new Promise<void>(resolve => worker.addEventListener('statechange', () => resolve(), { once: true }))
    }

    if (!registration.waiting) {
      updateStatus.value = 'La mise à jour n’a pas pu être installée.'
      return
    }

    updateStatus.value = 'Mise à jour trouvée. Redémarrage…'
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  } catch {
    updateStatus.value = 'Impossible de rechercher une mise à jour. Réessayez plus tard.'
  } finally {
    checkingUpdate.value = false
  }
}
</script>

<style scoped>
.settings {
  max-width: 600px;
  margin: 0 auto;
  padding: 16px;
}
.settings__header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.settings__header h1 {
  margin: 0;
  font-size: 1.3rem;
}
.btn-back {
  background: none;
  border: none;
  font-size: 0.95rem;
  cursor: pointer;
  color: var(--color-accent);
  padding: 0;
}
.settings__section {
  margin-bottom: 28px;
}
.settings__section h2 {
  font-size: 1rem;
  margin: 0 0 14px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.8rem;
}
.settings__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
}
.settings__row label {
  font-size: 0.9rem;
}
.settings__row select,
.settings__row input[type="range"] {
  max-width: 180px;
  width: 100%;
}
.btn-notify {
  padding: 7px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: none;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--color-text);
}
.settings__about {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
</style>
