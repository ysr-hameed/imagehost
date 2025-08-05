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
        @click="openInNewPage(n)"
      >
        <div class="content">
          <div class="title-row">
            <strong class="title">{{ n.title }}</strong>
            <button class="read-btn icon-only" @click.stop="markAsRead(n)">
              <Check class="icon-sm" />
            </button>
          </div>
          <p class="preview">{{ truncate(n.message, 100) }}</p>
          <div class="meta">
            <span class="time">{{ formatTime(n.created_at) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail View (if opened directly) -->
    <div v-else class="detail">
      <div class="detail-header">
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
import { useRouter } from 'vue-router'
import { formatDistanceToNow } from 'date-fns'
import { Check } from 'lucide-vue-next'
import { fetchNotifications, markNotificationRead } from '@/api/notifications'
import Loader from '@/components/global/Loader.vue'

const notifications = ref([])
const selected = ref(null)
const loading = ref(true)
const router = useRouter()

const loadNotifications = async () => {
  try {
    const data = await fetchNotifications()
    notifications.value = data.filter((n) => !n.is_read)
  } catch (err) {
    console.error('Failed to fetch notifications:', err)
    window.$toast('Failed to load notifications', 'error')
  } finally {
    loading.value = false
  }
}

const formatTime = (iso) => {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

const truncate = (text, len = 100) =>
  text.length > len ? text.substring(0, len) + '...' : text

const markAsRead = async (n) => {
  await markNotificationRead(n.id)
  notifications.value = notifications.value.filter((item) => item.id !== n.id)
  if (selected.value?.id === n.id) selected.value = null
}

const markAllAsRead = async () => {
  for (const n of notifications.value) {
    await markNotificationRead(n.id)
  }
  notifications.value = []
}

const openInNewPage = (n) => {
  router.push(`/notifications/${n.id}`) // 🔁 Ensure you have a route like this
}

onMounted(loadNotifications)
</script>

<style scoped>
  .notification-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: start;
  background: var(--bg);
}

.notifications-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.notifications-header h2 {
  font-size: 1.4rem;
  font-weight: 600;
  margin: 0;
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

.read-btn.icon-only {
  padding: 4px;
  background: transparent;
  color: var(--text-muted);
}

.read-btn.icon-only:hover {
  color: var(--text);
}

.chat-item {
  display: flex;
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

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
  padding: 0;
}

.preview {
  font-size: 0.9rem;
  color: var(--text-color);
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
  justify-content: flex-end;
  margin-bottom: 12px;
}

.detail-title {
  font-size: 1.25rem;
  font-weight: 600;
  text-align: center;
  margin: 0 0 12px 0;
}

.message {
  padding: 12px;
  border-top: 1px solid var(--border);
}

.message p {
  font-size: 1rem;
  color: var(--text-color);
  text-align: left;
  margin: 0;
}

.time {
  font-size: 0.75rem;
  color: var(--text-color);
  margin-top: 10px;
}

.empty {
  text-align: center;
  font-size: 0.9rem;
  color: var(--text-color);
  padding: 5px 0;
}

.icon {
  width: 18px;
  height: 18px;
}

.icon-sm {
  width: 15px;
  height: 15px;
  margin: auto;
}

</style>