import { appSettings } from '@/stores/settings'

export function applyTheme(mode = null) {
  const html = document.documentElement

  if (!mode) {
    mode = localStorage.getItem('theme_mode') || 'system'
  }

  // Apply dark class
  if (mode === 'dark') {
    html.classList.add('dark')
  } else if (mode === 'light') {
    html.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    html.classList.toggle('dark', prefersDark)
  }

  applyThemeColors()
  applyThemeColorMeta()
}

export function applyThemeColors() {
  const html = document.documentElement
  const isDark = html.classList.contains('dark')

  const primary = isDark
    ? appSettings.dark_primary_color || '#0e8aa3'
    : appSettings.light_primary_color || '#4338ca'

  html.style.setProperty('--primary', primary)

  // Optional: support other vars like --bg, --text, etc.
  if (appSettings.custom_colors) {
    for (const [key, value] of Object.entries(appSettings.custom_colors)) {
      html.style.setProperty(`--${key}`, value)
    }
  }
}

export function applyThemeColorMeta() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', bg)
}

export function initThemeWatcher() {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', () => {
    const mode = localStorage.getItem('theme_mode') || 'system'
    if (mode === 'system') applyTheme('system')
  })
}