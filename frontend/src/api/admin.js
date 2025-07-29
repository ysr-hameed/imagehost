import api from './axios'


// Overview
export function getAdminOverview() {
  return api.get('/admin/overview').then(res => res.data)
  console.log(data)
}

// Settings
export function getAdminSettings() {
  return api.get('/admin/settings').then(res => res.data)
}

export function updateAdminSettings(data) {
  return api.put('/admin/settings', data).then(res => res.data)
}

export function uploadFile(formData, type) {
  return api.post(`/admin/upload?type=${type}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(res => res.data)
}

// Users
export function getAdminUsers(params = {}) {
  return api.get('/admin/users', { params }).then(res => res.data)
}

export function getUserById(id) {
  return api.get(`/admin/users/${id}`)
}

export function updateAdminUser(id, data) {
  return api.patch(`/admin/users/${id}`, data).then(res => res.data)
}

export function deleteUser(id) {
  return api.delete(`/admin/users/${id}`)
}

// ✅ Aliases (optional)
export const deleteUserById = deleteUser
export const updateUser = updateAdminUser