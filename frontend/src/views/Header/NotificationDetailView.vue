<template>
  <div class="notification-detail">
    <!-- Loader -->
    <Loader v-if="loading" />

    <!-- Content -->
    <div v-else-if="notification" class="card">
      <div class="notification-header">
        <RouterLink to="/notifications" class="back-link">
          <ArrowLeft class="icon" />
          <span>Back</span>
        </RouterLink>

        <button v-if="!notification.is_read" class="btn secondary-btn" @click="markAsRead">
          <Check class="icon" />
          Mark as Read
        </button>
      </div>

      <h1 class="title">{{ notification.title }}</h1>

      <div class="meta">
        <span class="time">{{ formatTime(notification.created_at) }}</span>
      </div>

      <div class="message">
        <p>{{ notification.message }}</p>
      </div>
    </div>

    <!-- Fallback -->
    <div v-else class="empty-state">
      Notification not found
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { formatDistanceToNow } from 'date-fns'
import { fetchNotifications, markNotificationRead } from '@/api/notifications'
import Loader from '@/components/global/Loader.vue'
import { ArrowLeft, Check } from 'lucide-vue-next'

const notification = ref(null)
const loading = ref(true)
const route = useRoute()
const router = useRouter()

const formatTime = (iso) => {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

const loadNotification = async () => {
  try {
    const id = route.params.id
    const data = await fetchNotifications()
    notification.value = data.find((n) => n.id == id)

    if (!notification.value) {
      router.replace('/notifications')
    }
  } catch (err) {
    console.error(err)
    window.$toast('Failed to load notification', 'error')
  } finally {
    loading.value = false
  }
}

const markAsRead = async () => {
  if (!notification.value?.is_read) {
    await markNotificationRead(notification.value.id)
    notification.value.is_read = true
  }
}

onMounted(loadNotification)
</script>

<style scoped>
.notification-detail {
  padding: 0px;
  max-width: 700px;
  margin: auto;
}

.card {
  background: var(--card-bg);
  border-radius: var(--radius);
  padding: 0;
  box-shadow: var(--shadow);
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-color);
  text-decoration: none;
  font-size: 1rem;
}

.back-link:hover {
  color: var(--text);
}

.mark-read-btn {
  background: var(--btn-bg);
  color: var(--btn-text);
  border: none;
  padding: 6px 12px;
  border-radius: var(--radius);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.mark-read-btn:hover {
  background: var(--primary-hover);
}

.title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text);
  margin: 0;
  margin-top :10px;
}

.meta {
  font-size: 0.6rem;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.message p {
  font-size: 0.9rem;
  color: var(--text);
  line-height: 1.6;
  white-space: pre-wrap;
}

.empty-state {
  text-align: center;
  font-size: 1rem;
  color: var(--text-muted);
  padding: 40px 0;
}

.icon {
  width: 22px;
  height: 22px;
}
</style>