// stores/user.js
import { reactive } from 'vue'
import { getCurrentUser } from '@/api/user'

// User state
export const user = reactive({
  id: null,
  username: '',
  first_name: '',        // ✅ Added first_name
  last_name: '',         // ✅ Added last_name
  email: '',
  provider: null,
  is_admin: false,
  loaded: false,
  error: null
})

// Load user profile from backend
export async function loadUser(showToast = true) {
  try {
    const data = await getCurrentUser()

    Object.assign(user, {
      id: data.id,
      username: data.username,
      first_name: data.first_name || '',    // ✅ Assign first_name
      last_name: data.last_name || '',      // ✅ Assign last_name
      email: data.email,
      provider: data.provider || 'form',
      is_admin: data.is_admin,
      loaded: true,
      error: null
    })
  } catch (err) {
    Object.assign(user, {
      id: null,
      username: '',
      first_name: '',     // ✅ Reset first_name
      last_name: '',      // ✅ Reset last_name
      email: '',
      provider: null,
      is_admin: false,
      loaded: false,
      error: 'Failed to load user profile'
    })

    console.error('User load error:', err)

    if (showToast && typeof window.$toast === 'function') {
      window.$toast('Failed to load your profile', 'error')
    }
  }
}

// Clear user state and remove token
export function logout() {
  localStorage.removeItem('token')

  Object.assign(user, {
    id: null,
    username: '',
    first_name: '',       // ✅ Clear first_name
    last_name: '',        // ✅ Clear last_name
    email: '',
    provider: null,
    is_admin: false,
    loaded: false,
    error: null
  })

  if (typeof window.$toast === 'function') {
    window.$toast('You have been logged out', 'success')
  }
}