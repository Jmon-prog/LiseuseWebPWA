import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from '@/router'
import { sourceServices, SOURCE_REGISTRY_KEY } from '@/sources'
import App from './App.vue'
import './assets/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Injection du registre des services sources (pattern DI)
app.provide(SOURCE_REGISTRY_KEY, sourceServices)

app.mount('#app')
