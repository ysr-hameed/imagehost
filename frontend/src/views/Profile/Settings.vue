<template>
  <div class="settings-container">
    <h1 class="settings-title">Settings</h1>

    <div class="settings-grid">
      <!-- Theme Selection -->
      <div class="settings-item">
        <div class="label-row">
          <Palette class="icon" />
          <span>Theme</span>
        </div>
        <Select
          v-model="selectedTheme"
          :options="themeOptions"
          class="select"
          @update:modelValue="onThemeChange"
        />
      </div>

      <!-- Change Password -->
      <div class="settings-item">
        <div class="label-row">
          <KeyRound class="icon" />
          <span>Change Password</span>
        </div>
        <button
          class="btn"
          @click="openPasswordModal = true"
          :disabled="resetTimer > 0"
        >
          {{ resetTimer > 0 ? `Try again in ${resetTimer}s` : 'Change' }}
        </button>
      </div>

      <!-- Delete Account -->
      <div class="settings-item danger">
        <div class="label-row">
          <Trash2 class="icon" />
          <span>Delete Account</span>
        </div>
        <button class="btn danger" @click="openDeleteModal = true">Delete</button>
      </div>
    </div>

    <!-- Password Reset Modal -->
    <BaseModal
      v-if="openPasswordModal"
      title="Reset Password"
      :confirmText="loadingReset ? '' : 'Yes, Send'"
      cancelText="Cancel"
      :loading="loadingReset"
      :disabledConfirm="loadingReset || user.provider !== 'form'"
      @confirm="handlePasswordReset"
      @cancel="openPasswordModal = false"
    >
      <p v-if="user.provider === 'form'">
        Are you sure you want to send a password reset email to
        <strong>{{ user.email }}</strong>?
      </p>
      <p v-else>
        You signed in using <strong>{{ user.provider }}</strong>, so you can't reset your password here.
      </p>
    </BaseModal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Palette, KeyRound, Trash2 } from 'lucide-vue-next'
import Select from '@/components/ui/Select.vue'
import BaseModal from '@/components/BaseModal.vue'
import { applyTheme } from '@/utils/theme'
import { forgotPassword } from '@/api/user'
import { user } from '@/stores/user'

const selectedTheme = ref('system')
const openPasswordModal = ref(false)
const openDeleteModal = ref(false)
const resetTimer = ref(0)
const loadingReset = ref(false)
let timerInterval = null

const themeOptions = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' }
]

onMounted(() => {
  selectedTheme.value = localStorage.getItem('theme_mode') || 'system'
})

function onThemeChange(mode) {
  localStorage.setItem('theme_mode', mode)
  applyTheme(mode)
}

function startResetTimer() {
  resetTimer.value = 120 // 2 minutes
  timerInterval = setInterval(() => {
    resetTimer.value--
    if (resetTimer.value <= 0) {
      clearInterval(timerInterval)
    }
  }, 1000)
}

async function handlePasswordReset() {
  if (loadingReset.value || resetTimer.value > 0) return // prevent spam

  if (user.provider !== 'form') {
    window.$toast(`You can't reset password for ${user.provider || 'this'} login.`, 'info')
    openPasswordModal.value = false
    return
  }

  loadingReset.value = true
  try {
    await forgotPassword(user.email)
    window.$toast('Password reset email sent!', 'success')
    startResetTimer()

    setTimeout(() => {
      openPasswordModal.value = false
    }, 1200)
  } catch (err) {
    if (err.response?.status === 429) {
      window.$toast('Too many requests. Please wait and try again.', 'error')
      startResetTimer()
    } else {
      console.error(err)
      window.$toast('Failed to send password reset email.', 'error')
    }
  } finally {
    loadingReset.value = false
  }
}
</script>

<style scoped>
.settings-container {
  padding: 0rem;
  font-family: var(--font-main);
  color: var(--text);
}

.settings-title {
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
  font-weight: 600;
}

.settings-grid {
  display: grid;
  gap: 1rem;
  padding: 0;
}

@media (min-width: 768px) {
  .settings-grid {
    padding: 0 2rem;
  }
}

.settings-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
  padding-bottom: 1rem;
}

.settings-item.danger {
  color: var(--red);
}

.label-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
}

.icon {
  color: var(--primary);
  width: 20px;
  height: 20px;
}

.select {
  min-width: 150px;
  max-width: 200px;
}

.btn {
  padding: 0.5rem 1rem;
  background: var(--primary);
  color: var(--white);
  border-radius: 0.5rem;
  font-weight: 500;
  border: none;
  transition: 0.3s;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.btn[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.outline {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
}

.btn.danger {
  background: #dc2626;
}
</style>