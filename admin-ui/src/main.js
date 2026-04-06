import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import router from './router'
import { registerAppIcons } from './icons'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
registerAppIcons(app)

app.use(pinia)
app.use(router)

app.mount('#app')
