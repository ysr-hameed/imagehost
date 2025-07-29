<template>
  <div class="toast-wrapper">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      :class="['toast', toast.type]"
    >
      <component :is="getIcon(toast.type)" class="toast-icon" :size="18" />
      <span class="message">{{ toast.message }}</span>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-vue-next'
import '@/assets/styles/components/toast.css'
const toasts = reactive([])

function addToast(message, type = 'info', duration = 3000) {
  const id = Date.now() + Math.random()
  toasts.push({ id, message, type })
  setTimeout(() => {
    const index = toasts.findIndex(t => t.id === id)
    if (index !== -1) toasts.splice(index, 1)
  }, duration)
}

function getIcon(type) {
  switch (type) {
    case 'success':
      return CheckCircle
    case 'error':
      return XCircle
    case 'warning':
      return AlertTriangle
    case 'info':
    default:
      return Info
  }
}

defineExpose({ addToast })
</script>