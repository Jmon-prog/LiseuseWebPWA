import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type Theme = 'light' | 'dark' | 'sepia'
export type FontFamily = 'serif' | 'sans-serif' | 'monospace'

const STORAGE_KEY = 'liseuse-settings'

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

export const useSettingsStore = defineStore('settings', () => {
    const saved = loadFromStorage()

    const theme = ref<Theme>(saved?.theme ?? 'light')
    const fontFamily = ref<FontFamily>(saved?.fontFamily ?? 'serif')
    const fontSize = ref<number>(saved?.fontSize ?? 18)       // px
    const lineHeight = ref<number>(saved?.lineHeight ?? 1.8)
    const columnWidth = ref<number>(saved?.columnWidth ?? 680) // px max
    const marginX = ref<number>(saved?.marginX ?? 24)          // px

    function persist() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            theme: theme.value,
            fontFamily: fontFamily.value,
            fontSize: fontSize.value,
            lineHeight: lineHeight.value,
            columnWidth: columnWidth.value,
            marginX: marginX.value,
        }))
    }

    watch([theme, fontFamily, fontSize, lineHeight, columnWidth, marginX], persist, { deep: true })

    function applyTheme() {
        document.documentElement.setAttribute('data-theme', theme.value)
    }

    return {
        theme,
        fontFamily,
        fontSize,
        lineHeight,
        columnWidth,
        marginX,
        applyTheme,
    }
})
