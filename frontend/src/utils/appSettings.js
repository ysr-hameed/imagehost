// src/utils/appSettings.js
export async function getAppSettings() {
  const cacheKey = 'appSettings'
  const cacheTimeKey = 'appSettingsFetchedAt'
  const cacheHours = 12

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey))
    const lastFetched = parseInt(localStorage.getItem(cacheTimeKey))

    if (cached && lastFetched && Date.now() - lastFetched < cacheHours * 3600 * 1000) {
      return cached
    }

    const res = await fetch(import.meta.env.VITE_API_BASE_URL + '/api/settings/app')
    if (!res.ok) throw new Error('Settings fetch failed')

    const data = await res.json()
    localStorage.setItem(cacheKey, JSON.stringify(data))
    localStorage.setItem(cacheTimeKey, Date.now().toString())
    return data
  } catch (err) {
    console.error('Error fetching app settings:', err)
    throw err
  }
}  