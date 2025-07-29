<template>
  <div class="notification-wrapper">
    <!-- Loader -->
    <Loader v-if="loading" />

    <!-- List View -->
    <div v-else-if="!selected" class="list">
      <div class="notifications-header">
        <h2>Notifications</h2>
        <button class="read-btn" v-if="notifications.length" @click="markAllAsRead">
          <Check class="icon" /> Mark All Read
        </button>
      </div>

      <div v-if="!notifications.length" class="empty">
        No unread notifications
      </div>

      <div
        v-for="n in notifications"
        :key="n.id"
        class="chat-item"
        @click="selectNotification(n)"
      >
        <div class="content">
          <strong class="title">{{ n.title }}</strong>
          <p class="preview">{{ truncate(n.message, 80) }}</p>
          <div class="meta">
            <span class="time">{{ formatTime(n.created_at) }}</span>
            <button class="read-btn" @click.stop="markAsRead(n)">
              <Check class="icon" /> Mark Read
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail View -->
    <div v-else class="detail">
      <div class="detail-header">
        <button class="back-btn" @click="goBack">
          <ArrowLeft class="icon" />
        </button>
        <button class="read-btn" @click="markAsRead(selected)">
          <Check class="icon" /> Mark Read
        </button>
      </div>

      <h3 class="detail-title">{{ selected.title }}</h3>

      <div class="message">
        <p>{{ selected.message }}</p>
        <div class="time">{{ formatTime(selected.created_at) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { formatDistanceToNow } from 'date-fns'
import { ArrowLeft, Check } from 'lucide-vue-next'
import { fetchNotifications, markNotificationRead } from '@/api/notifications'
import Loader from '@/components/global/Loader.vue' // ✅ Loader component

const notifications = ref([])
const selected = ref(null)
const loading = ref(true) // ✅ Add loading state

const loadNotifications = async () => {
  try {
    const data = await fetchNotifications()
    notifications.value = data.filter((n) => !n.is_read)
  } catch (err) {
    console.error('Failed to fetch notifications:', err)
    window.$toast('Failed to load notifications', 'error')
  } finally {
    loading.value = false // ✅ Set loading false
  }
}

const formatTime = (iso) => {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

const truncate = (text, len = 100) =>
  text.length > len ? text.substring(0, len) + '...' : text

const selectNotification = (n) => {
  selected.value = n
  history.pushState(null, null, location.href)
  window.addEventListener('popstate', goBack)
}

const goBack = () => {
  selected.value = null
  window.removeEventListener('popstate', goBack)
}

const markAsRead = async (n) => {
  await markNotificationRead(n.id)
  notifications.value = notifications.value.filter((item) => item.id !== n.id)
  if (selected.value?.id === n.id) goBack()
}

const markAllAsRead = async () => {
  for (const n of notifications.value) {
    await markNotificationRead(n.id)
  }
  notifications.value = []
}

onMounted(loadNotifications)
</script>

<style scoped>
.notification-wrapper {
  width: 100%;
  margin: 0;
  display: flex;
  flex-direction : column;
  align-items:start;
  background: var(--bg);
}

.notifications-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0;
}

.notifications-header h2 {
  font-size: 1.4rem;
  font-weight: 600;
  margin:0;
}

.read-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  padding: 6px 12px;
  background: var(--btn-bg);
  color: var(--btn-text);
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
}

.read-btn:hover {
  background: var(--primary-hover);
}

.chat-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
}

.preview {
  font-size: 0.9rem;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}



.detail {
  padding-top: 8px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.detail-title {
  font-size: 1.25rem;
  font-weight: 600;
  text-align: center;
  margin-bottom: 12px;
}


.back-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}

.back-btn:hover {
  color: var(--text);
}

.message {
  padding: 12px;
  border-top: 1px solid var(--border);
}

.message p {
  font-size: 1rem;
  color: var(--text);
  text-align: left;
}

.time {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 10px;
}

.empty {
  text-align: center;
  font-size: 0.9rem;
  color: var(--text);
  padding: 5px 0;
}

.icon {
  width: 18px;
  height: 18px;
}

.icon-sm {
  width:15px;
  height: 15px;
  margin:auto;
}
</style>