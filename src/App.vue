<template>
  <RouterView />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settingsStore'

const settings = useSettingsStore()
onMounted(() => settings.applyTheme())
</script>
