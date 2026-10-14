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
      <h2>Sauvegarde</h2>
      <div class="settings__row">
        <span>Bibliothèque, chapitres et réglages</span>
        <button class="btn-notify" :disabled="backupBusy" @click="exportBackup">
          {{ backupBusy ? 'Préparation…' : 'Exporter' }}
        </button>
      </div>
      <div class="settings__row">
        <span>Restaurer une sauvegarde</span>
        <button class="btn-notify" :disabled="backupBusy" @click="backupInput?.click()">
          Choisir un fichier
        </button>
        <input
          ref="backupInput"
          class="backup-input"
          type="file"
          accept="application/json,.json"
          @change="importBackup"
        />
      </div>
      <p v-if="backupStatus" class="settings__about" role="status" aria-live="polite">{{ backupStatus }}</p>
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
import { createBackup, parseBackup, restoreBackup } from '@/db/backup'
import { useSettingsStore } from '@/stores/settingsStore'

const router = useRouter()
const settings = useSettingsStore()
const appVersion = __APP_VERSION__
const checkingUpdate = ref(false)
const updateStatus = ref('')
const backupInput = ref<HTMLInputElement | null>(null)
const backupBusy = ref(false)
const backupStatus = ref('')

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

async function exportBackup() {
  backupBusy.value = true
  backupStatus.value = ''
  try {
    const json = await createBackup({
      theme: settings.theme,
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      columnWidth: settings.columnWidth,
      marginX: settings.marginX,
    })
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `liseuseweb-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    backupStatus.value = 'Sauvegarde exportée.'
  } catch (e: unknown) {
    backupStatus.value = e instanceof Error ? e.message : String(e)
  } finally {
    backupBusy.value = false
  }
}

async function importBackup(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  backupBusy.value = true
  backupStatus.value = ''
  try {
    const backup = parseBackup(await file.text())
    const confirmed = window.confirm(
      `Restaurer ${backup.fictions.length} fiction(s) et ${backup.chapters.length} chapitre(s) ?\n\nCela remplacera les données actuelles de cet appareil.`
    )
    if (!confirmed) return

    await restoreBackup(backup)
    settings.theme = backup.settings.theme
    settings.fontFamily = backup.settings.fontFamily
    settings.fontSize = backup.settings.fontSize
    settings.lineHeight = backup.settings.lineHeight
    settings.columnWidth = backup.settings.columnWidth
    settings.marginX = backup.settings.marginX
    settings.applyTheme()
    backupStatus.value = 'Sauvegarde restaurée.'
  } catch (e: unknown) {
    backupStatus.value = e instanceof Error ? e.message : String(e)
  } finally {
    backupBusy.value = false
    input.value = ''
  }
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
.backup-input {
  display: none;
}
</style>
