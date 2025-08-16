<template>
  <div class="settings-container">
    <!-- Global Loader -->
    <Loader v-if="loading" />

    <!-- Main Content -->
    <div v-else-if="user.loaded">
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
            style="width: 200px"
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
            class="btn btn-primary small-btn"
            @click="openPasswordModal = true"
            :disabled="resetTimer > 0"
          >
            {{ resetTimer > 0 ? ` ${resetTimer}s` : 'Change' }}
          </button>
        </div>
        
        <!-- Delete Account -->
        <div class="settings-item danger">
          <div class="label-row">
            <Trash2 class="icon" />
            <span>Delete Account</span>
          </div>
          <button class="btn btn-danger small-btn" @click="openDeleteModal = true">Delete</button>
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

    <!-- Error State -->
    <div v-else>
      <p>Failed to load your profile. Please <a href="/login">login again</a>.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Palette, KeyRound, Trash2 } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import Select from '@/components/ui/Select.vue'
import BaseModal from '@/components/BaseModal.vue'
import Loader from '@/components/Loader.vue'
import { applyTheme } from '@/utils/theme'
import { forgotPassword } from '@/api/user'
import { user, loadUser } from '@/stores/user'
import '@/assets/styles/pages/setting.css'


const selectedTheme = ref('system')
const openPasswordModal = ref(false)
const openDeleteModal = ref(false)
const resetTimer = ref(0)
const loadingReset = ref(false)
const loading = ref(true)
let timerInterval = null

const route = useRoute()
const router = useRouter()

const themeOptions = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' }
]

onMounted(async () => {
  try {
    await loadUser()

    if (user.loaded && route.query.oauth === 'success') {
      window.$toast('Successfully logged in via OAuth', 'success')
      router.replace({ path: route.path })
    }

    if (!user.loaded) throw new Error('User not loaded')
  } catch (err) {
    console.error('Failed to load profile:', err)
    window.$toast('Failed to load your profile', 'error')
  } finally {
    loading.value = false
  }

  selectedTheme.value = localStorage.getItem('theme_mode') || 'system'
})

function onThemeChange(mode) {
  localStorage.setItem('theme_mode', mode)
  applyTheme(mode)
}

function startResetTimer() {
  resetTimer.value = 120
  timerInterval = setInterval(() => {
    resetTimer.value--
    if (resetTimer.value <= 0) clearInterval(timerInterval)
  }, 1000)
}

async function handlePasswordReset() {
  if (loadingReset.value || resetTimer.value > 0) return

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