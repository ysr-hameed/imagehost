<template>
  <div class="api-key-page">
    <h1 class="page-title">
      <KeyRound class="icon" />
      API Key
    </h1>

    <Loader v-if="loading" />

    <div v-else class="api-key-container">
      <div v-if="apiKey" class="api-key-box">
        <input
          class="api-key-input"
          :value="apiKey"
          readonly
          @click="copyToClipboard"
        />
        <div class="icon-group">
          <Copy class="icon-btn" @click="copyToClipboard" />
          <RefreshCw class="icon-btn" @click="regenerateApiKey" />
        </div>
      </div>

      <button
        v-else
        class="generate-btn"
        @click="generateApiKey"
      >
        <KeyRound class="icon" />
        Generate API Key
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { KeyRound, Copy, RefreshCw } from 'lucide-vue-next'
import Loader from '@/components/Loader.vue'
import api from '@/api/apiKey'

const loading = ref(true)
const apiKey = ref('')

const fetchApiKey = async () => {
  loading.value = true
  try {
    const { data } = await api.get()
    apiKey.value = data.apiKey
  } catch (err) {
    console.error(err)
    window.$toast('Failed to fetch API key', 'error')
  } finally {
    loading.value = false
  }
}

const generateApiKey = async () => {
  loading.value = true
  try {
    const { data } = await api.generate()
    apiKey.value = data.apiKey
    window.$toast('API key generated!', 'success')
  } catch (err) {
    console.error(err)
    window.$toast('Failed to generate API key', 'error')
  } finally {
    loading.value = false
  }
}

const regenerateApiKey = async () => {
  if (!confirm('Are you sure you want to regenerate your API key?')) return

  loading.value = true
  try {
    const { data } = await api.regenerate()
    apiKey.value = data.apiKey
    window.$toast('API key regenerated', 'success')
  } catch (err) {
    console.error(err)
    window.$toast('Failed to regenerate key', 'error')
  } finally {
    loading.value = false
  }
}

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(apiKey.value)
    window.$toast('Copied to clipboard', 'success')
  } catch (err) {
    console.error(err)
    window.$toast('Failed to copy', 'error')
  }
}

onMounted(fetchApiKey)
</script>

<style scoped>
.api-key-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.page-title {
  font-size: 1.75rem;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.api-key-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.api-key-box {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid var(--border-color);
  background: var(--bg-light);
  border-radius: 8px;
  padding: 0.75rem 1rem;
}

.api-key-input {
  flex-grow: 1;
  border: none;
  background: transparent;
  font-size: 1rem;
  font-family: monospace;
  outline: none;
  cursor: pointer;
}

.icon-group {
  display: flex;
  gap: 0.5rem;
  margin-left: 0.75rem;
}

.icon-btn {
  cursor: pointer;
  transition: opacity 0.2s ease;
}
.icon-btn:hover {
  opacity: 0.7;
}

.generate-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background-color: var(--primary);
  color: #fff;
  border: none;
  padding: 0.75rem 1.25rem;
  font-size: 1rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.generate-btn:hover {
  background-color: var(--primary-dark);
}
</style>