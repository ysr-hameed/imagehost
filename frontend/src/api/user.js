import api from './axios'

export async function getCurrentUser() {
  const res = await api.get('/me')
  return res.data
}


export async function checkUsernameAvailable(username) {
  const res = await api.get(`/username-check`, {
    params: { username: encodeURIComponent(username) },
  })
  return res.data.available
}

export async function logout() {
  await api.post('/logout', {})
}

export async function forgotPassword(email) {
  const res = await api.post('/forgot-password', {
    email: email.trim().toLowerCase(),
  })
  return res.data
}

export async function login({ identifier, password }) {
  const res = await api.post('/login', {
    identifier: identifier.trim(),
    password,
  })
  return res.data
}

export async function resendVerification(identifier) {
  const res = await api.post('/resend-verification', {
    identifier: identifier.trim().toLowerCase(),
  })
  return res.data
}

export async function registerUser(payload) {
  const res = await api.post('/register', payload)
  return res.data
}
export async function changePassword({ currentPassword, newPassword, confirmPassword }) {
  const res = await api.post('/auth/change-password', {
    currentPassword,
    newPassword,
    confirmPassword
  })
  return res.data
}
export async function deleteAccount() {
  const res = await api.post('/auth/delete-account')
  return res.data
}

export async function cancelAccountDeletion() {
  const res = await api.post('/auth/cancel-delete')
  return res.data
}