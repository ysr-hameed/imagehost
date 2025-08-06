<template>
  <div class="api-key-page">
    <h1>My API Keys</h1>

    <!-- New Key Form -->
    <form @submit.prevent="createKey" class="form">
      <input v-model="newKeyName" placeholder="Enter name (e.g. My App)" />
      <button type="submit">Create API Key</button>
    </form>

    <Loader v-if="loading" />
    <ul v-else class="key-list">
      <li v-for="key in keys" :key="key.id" class="key-item">
        <div class="key-details">
          <strong>{{ key.name }}</strong><br />
          <code>{{ key.key }}</code>
        </div>
        <div class="actions">
          <button @click="regenerateKey(key.id)">♻ Regenerate</button>
          <button @click="deleteKey(key.id)">🗑 Delete</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api/axios'

const keys = ref([])
const loading = ref(true)
const newKeyName = ref('')

const fetchKeys = async () => {
  try {
    const res = await api.get('/me/api-keys')
    keys.value = res.data
  } catch {
    window.$toast('Failed to load keys', 'error')
  } finally {
    loading.value = false
  }
}

const createKey = async () => {
  if (newKeyName.value.length < 3) return window.$toast('Name too short', 'error')
  try {
    const res = await api.post('/me/api-keys', { name: newKeyName.value })
    keys.value.unshift(res.data)
    newKeyName.value = ''
    window.$toast('Key created', 'success')
  } catch {
    window.$toast('Error creating key', 'error')
  }
}

const regenerateKey = async (id) => {
  try {
    const res = await api.post(`/me/api-keys/${id}/regenerate`)
    const index = keys.value.findIndex(k => k.id === id)
    if (index !== -1) keys.value[index] = res.data
    window.$toast('Key regenerated', 'success')
  } catch {
    window.$toast('Error regenerating', 'error')
  }
}

const deleteKey = async (id) => {
  if (!confirm('Are you sure you want to delete this key?')) return
  try {
    await api.delete(`/me/api-keys/${id}`)
    keys.value = keys.value.filter(k => k.id !== id)
    window.$toast('Key deleted', 'success')
  } catch {
    window.$toast('Delete failed', 'error')
  }
}

onMounted(fetchKeys)
</script>

<style scoped>
.api-key-page {
  max-width: 600px;
  margin: auto;
}
.form {
  margin-bottom: 1rem;
  display: flex;
  gap: 10px;
}
.form input {
  flex: 1;
  padding: 8px;
}
.form button {
  padding: 8px 12px;
}
.key-list {
  list-style: none;
  padding: 0;
}
.key-item {
  border: 1px solid #ddd;
  padding: 10px;
  margin-bottom: 10px;
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.actions button {
  margin-left: 8px;
}
</style>