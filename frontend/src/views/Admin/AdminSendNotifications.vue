<template>
  <div class="max-w-xl mx-auto p-6">
    <h2 class="text-2xl font-bold mb-4">Send Notification</h2>

    <form @submit.prevent="submit">
      <input
        v-model="title"
        type="text"
        placeholder="Title"
        class="w-full mb-3 border p-2 rounded"
        required
      />
      <textarea
        v-model="message"
        placeholder="Message"
        class="w-full mb-3 border p-2 rounded h-32"
        required
      />
      <input
        v-model="targets"
        placeholder="Target usernames/emails (comma separated, optional)"
        class="w-full mb-3 border p-2 rounded"
      />

      <button
        :disabled="loading"
        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {{ loading ? 'Sending...' : 'Send Notification' }}
      </button>
    </form>

    <p v-if="success" class="text-green-600 mt-4">
      ✅ Notification sent to <strong>{{ sent }}</strong> user(s).
    </p>
    <p v-if="error" class="text-red-600 mt-4">❌ {{ error }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { sendNotificationToAll } from '@/api/notifications'

const title = ref('')
const message = ref('')
const targets = ref('')
const loading = ref(false)
const success = ref(false)
const error = ref('')
const sent = ref(0)

async function submit() {
  loading.value = true
  success.value = false
  error.value = ''
  sent.value = 0

  try {
    const res = await sendNotificationToAll({
      title: title.value,
      message: message.value,
      targets: targets.value
        ? targets.value.split(',').map(t => t.trim()).filter(Boolean)
        : [] // send to all if no targets provided
    })

    sent.value = res?.data?.sent ?? 0
    success.value = true

    // Clear form after successful send
    title.value = ''
    message.value = ''
    targets.value = ''
  } catch (err) {
    console.error('Error sending notification:', err)
    error.value = err?.response?.data?.error || 'Failed to send notification'
  } finally {
    loading.value = false
  }
}
</script>