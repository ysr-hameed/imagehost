import api from './axios'

// ✅ Fetch all notifications for the current user
export async function fetchNotifications() {
  const res = await api.get('/notifications')
  return res.data.notifications // Returns an array of notifications
}

// ✅ Fetch unread notification count for the current user
export async function fetchUnreadCount() {
  const res = await api.get('/notifications/unread-count')
  return res.data.count // Returns a number
}

// ✅ Mark a specific notification as read
export async function markNotificationRead(id) {
  const res = await api.post(`/notifications/${id}/read`)
  return res.data.success // Optional: return success flag
}

// ✅ Send a notification to selected users (admin only)
export async function sendNotificationToAll({ title, message, targets }) {
  const res = await api.post('/admin/notifications', {
    title,
    message,
    targets, // Can be ['all'] or user IDs
  })
  return res.data.success // Optional: return success flag
}