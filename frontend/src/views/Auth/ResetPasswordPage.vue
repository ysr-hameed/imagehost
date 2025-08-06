<template>
  <div class="login-page">
    <div class="content">
      <h1 class="title">Reset Password</h1>
      <p class="sub">Enter a new password for your account.</p>

      <!-- New Password -->
      <div class="input-box password-box">
        <Lock class="icon" :size="18" />
        <input
          :type="showPassword ? 'text' : 'password'"
          v-model="password"
          placeholder="New Password"
          autocomplete="new-password"
        />
        <component
          :is="showPassword ? EyeOff : Eye"
          class="eye-icon"
          :size="18"
          @click="togglePassword"
        />
      </div>

      <!-- Confirm Password -->
      <div class="input-box password-box">
        <Lock class="icon" :size="18" />
        <input
          :type="showConfirm ? 'text' : 'password'"
          v-model="confirmPassword"
          placeholder="Confirm New Password"
          autocomplete="new-password"
        />
        <component
          :is="showConfirm ? EyeOff : Eye"
          class="eye-icon"
          :size="18"
          @click="toggleConfirm"
        />
      </div>

      <!-- Submit Button -->
      <button class="login-btn btn btn-primary" @click="handleSubmit">
        <span v-if="!loading">Reset Password</span>
        <ButtonLoader v-else :loading="true" />
      </button>

      <div class="signup">
        Back to <router-link to="/login">Login</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Lock, Eye, EyeOff } from 'lucide-vue-next'
import ButtonLoader from '@/components/ButtonLoader.vue'
import axios from 'axios'
import '@/assets/styles/pages/auth.css'

const API = import.meta.env.VITE_API_BASE_URL

// Form State
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirm = ref(false)
const loading = ref(false)

// Route and token
const route = useRoute()
const router = useRouter()
const token = ref('')

// Initialize token from query
onMounted(() => {
  token.value = route.query.token || ''
  if (!token.value) {
    window.$toast('Reset token is missing from the URL', 'error')
    router.push('/forgot-password')
  }
})

const togglePassword = () => {
  showPassword.value = !showPassword.value
}

const toggleConfirm = () => {
  showConfirm.value = !showConfirm.value
}

const handleSubmit = async () => {
  if (!password.value || !confirmPassword.value) {
    window.$toast('Both password fields are required', 'warning')
    return
  }

  if (password.value.length < 6) {
    window.$toast('Password must be at least 6 characters', 'warning')
    return
  }

  if (password.value !== confirmPassword.value) {
    window.$toast('Passwords do not match', 'error')
    return
  }

  loading.value = true
  try {
    await axios.post(`${API}/reset-password`, {
      token: token.value,
      password: password.value
    })

    window.$toast('Password reset successful', 'success')
    router.push('/login')
  } catch (err) {
    const msg = err?.response?.data?.error || 'Something went wrong'
    window.$toast(msg, 'error')
  } finally {
    loading.value = false
  }
}
</script>