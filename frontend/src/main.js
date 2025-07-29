import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { getAppSettings } from '@/utils/appSettings'
import { appSettings } from '@/stores/settings'
import { loadUser } from '@/stores/user'
import { applyTheme, initThemeWatcher } from '@/utils/theme'
import '@/assets/styles/variables.css'

initThemeWatcher()
initApp()

async function initApp() {
  try {
    const settings = await getAppSettings()
    Object.assign(appSettings, settings)
    appSettings.loaded = true

    applyTheme()

    await loadUser()
  } catch {
    Object.assign(appSettings, {
      app_name: 'Servoro',
      light_primary_color: '#000000',
      dark_primary_color: '#0e8aa3',
      favicon_url: '/favicon.png'
    })
    appSettings.loaded = true

    applyTheme()

    await loadUser()
  }

  updateFavicon()
  document.title = appSettings.app_name

  requestAnimationFrame(() => {
    createApp(App).use(router).mount('#app')
  })
}

function updateFavicon() {
  let favicon = document.querySelector("link[rel~='icon']")
  if (!favicon) {
    favicon = document.createElement('link')
    favicon.rel = 'icon'
    document.head.appendChild(favicon)
  }
  favicon.href = appSettings.favicon_url + '?v=' + Date.now()
}