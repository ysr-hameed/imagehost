<template>
  <div class="api-key-page">
    <h1>My API Keys</h1>

    <!-- Create New Key -->
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
          <!-- Toggle Enabled/Disabled -->
          <button @click="toggleKey(key)" class="btn">
            <component :is="key.enabled ? Eye : EyeOff" size="18" />
            <span>{{ key.enabled ? 'Disable API Key' : 'Enable API Key' }}</span>
          </button>

          <!-- Regenerate -->
          <button @click="regenerateKey(key.id)" class="btn">♻ Regenerate</button>

          <!-- Delete -->
          <button @click="deleteKey(key.id)" class="btn danger">🗑 Delete</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api/axios'
import { Eye, EyeOff } from 'lucide-vue-next'

const keys = ref([])
const loading = ref(true)
const newKeyName = ref('')

const fetchKeys = async () => {
  try {
    const res = await api.get('/me/api-keys')
    keys.value = res.data
  } catch {
    window.$toast('Failed to load API keys', 'error')
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
    window.$toast('API Key created', 'success')
  } catch {
    window.$toast('Error creating API key', 'error')
  }
}

const regenerateKey = async (id) => {
  try {
    const res = await api.post(`/me/api-keys/${id}/regenerate`)
    const index = keys.value.findIndex(k => k.id === id)
    if (index !== -1) keys.value[index] = res.data
    window.$toast('API Key regenerated', 'success')
  } catch {
    window.$toast('Error regenerating key', 'error')
  }
}

const deleteKey = async (id) => {
  if (!confirm('Are you sure you want to delete this key?')) return
  try {
    await api.delete(`/me/api-keys/${id}`)
    keys.value = keys.value.filter(k => k.id !== id)
    window.$toast('API Key deleted', 'success')
  } catch {
    window.$toast('Failed to delete key', 'error')
  }
}

const toggleKey = async (key) => {
  try {
    const res = await api.post(`/me/api-keys/${key.id}/toggle`)
    const updatedKey = res.data
    const index = keys.value.findIndex(k => k.id === key.id)
    if (index !== -1) keys.value[index] = updatedKey
    window.$toast(`API Key ${updatedKey.enabled ? 'enabled' : 'disabled'}`, 'success')
  } catch {
    window.$toast('Failed to toggle API key', 'error')
  }
}

onMounted(fetchKeys)
</script>

<style scoped>
.api-key-page {
  max-width: 600px;
  margin: auto;
  padding: 20px;
}

.form {
  display: flex;
  gap: 10px;
  margin-bottom: 1rem;
}
.form input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 6px;
}
.form button {
  padding: 8px 12px;
  border: none;
  background-color: #007bff;
  color: white;
  border-radius: 6px;
  cursor: pointer;
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
.key-details {
  max-width: 60%;
  word-break: break-word;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.btn {
  background-color: #f0f0f0;
  border: none;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
}
.btn:hover {
  background-color: #e0e0e0;
}
.btn.danger {
  background-color: #ffe5e5;
}
.btn.danger:hover {
  background-color: #ffcccc;
}
</style>