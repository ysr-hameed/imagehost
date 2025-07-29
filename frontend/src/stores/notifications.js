// src/stores/notifications.js
import { ref } from 'vue'

export const notificationCount = ref(0)

export function setNotificationCount(count) {
  notificationCount.value = count
}

export function decrementNotificationCount(count = 1) {
  notificationCount.value = Math.max(notificationCount.value - count, 0)
} 