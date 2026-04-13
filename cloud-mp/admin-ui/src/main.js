import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import router from './router'
import { registerAppIcons } from './icons'
import './style.css'

function installChunkRecovery(routerInstance) {
  const RELOAD_KEY = 'admin-chunk-reload-at'
  const RELOAD_WINDOW_MS = 15000
  const errorPattern = /Failed to fetch dynamically imported module|Importing a module script failed|Unable to preload CSS/i

  const reloadOnce = () => {
    try {
      const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0)
      const now = Date.now()
      if (last && now - last < RELOAD_WINDOW_MS) return
      window.sessionStorage.setItem(RELOAD_KEY, String(now))
    } catch (_) {}

    const url = new URL(window.location.href)
    url.searchParams.delete('v')
    window.location.replace(url.toString())
  }

  const shouldRecover = (err) => {
    const message = String(err?.message || err || '')
    return errorPattern.test(message)
  }

  window.addEventListener('error', (event) => {
    if (shouldRecover(event?.error || event?.message)) {
      reloadOnce()
    }
  }, true)

  window.addEventListener('unhandledrejection', (event) => {
    if (shouldRecover(event?.reason)) {
      event.preventDefault?.()
      reloadOnce()
    }
  })

  routerInstance.onError((error) => {
    if (shouldRecover(error)) {
      reloadOnce()
    }
  })
}

const app = createApp(App)
const pinia = createPinia()
registerAppIcons(app)
installChunkRecovery(router)

app.use(pinia)
app.use(router)

app.mount('#app')
