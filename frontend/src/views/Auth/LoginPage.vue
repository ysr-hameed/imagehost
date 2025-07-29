<template>
  <div class="login-page">
    <div class="content">
      <h1 class="title">Login</h1>

      <div class="input-box">
        <Mail class="icon" :size="18" />
        <input
          type="text"
          v-model="identifier"
          placeholder="Username or Email"
          autocomplete="username"
        />
      </div>

      <div class="input-box password-box">
        <Lock class="icon" :size="18" />
        <input
          :type="showPassword ? 'text' : 'password'"
          v-model="password"
          placeholder="Enter your password"
          autocomplete="current-password"
        />
        <component
          :is="showPassword ? EyeOff : Eye"
          class="eye-icon"
          :size="18"
          @click="togglePassword"
        />
      </div>

      <div class="options">
        <label class="remember">
          <input type="checkbox" v-model="remember" />
          <span>Remember me</span>
        </label>
        <a href="/forgot-password" class="forgot">Forgot password?</a>
      </div>

      <button class="btn btn-primary" @click="handleLogin">
        <span v-if="!loading">Login</span>
        <ButtonLoader v-else :loading="true" />
      </button>

      <p class="resend-link" v-if="showResend">
        Didn't receive a verification email?
        <a @click.prevent="resendVerificationEmail" href="#">{{ resendText }}</a>
      </p>

      <div class="divider"><span>or</span></div>
      <div class="oauth-buttons">
        <button class="oauth " @click="handleGoogle">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 32 32" style="margin-right: 6px;">
            <path
              fill="currentColor"
              d="M 16.003906 14.0625 L 16.003906 18.265625 L 21.992188 18.265625 C 21.210938 20.8125 19.082031 22.636719 16.003906 22.636719 C 12.339844 22.636719 9.367188 19.664063 9.367188 16 C 9.367188 12.335938 12.335938 9.363281 16.003906 9.363281 C 17.652344 9.363281 19.15625 9.96875 20.316406 10.964844 L 23.410156 7.867188 C 21.457031 6.085938 18.855469 5 16.003906 5 C 9.925781 5 5 9.925781 5 16 C 5 22.074219 9.925781 27 16.003906 27 C 25.238281 27 27.277344 18.363281 26.371094 14.078125 Z"
            />
          </svg>
          Google
        </button>

        <button class="oauth" @click="handleGitHub">
          <Github :size="18" style="margin-right: 6px;" />
          GitHub
        </button>
      </div>

      <div class="signup">
        Don’t have an account? <router-link to="/register">Signup now</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Mail, Lock, Eye, EyeOff, Github } from 'lucide-vue-next'
import ButtonLoader from '@/components/ButtonLoader.vue'
import '@/assets/styles/auth/index.css'
import { login, resendVerification } from '@/api/user.js'
import { loadUser } from '@/stores/user'

const API = import.meta.env.VITE_API_BASE_URL
const router = useRouter()
const route = useRoute()

const identifier = ref('')
const password = ref('')
const remember = ref(false)
const showPassword = ref(false)
const loading = ref(false)
const showResend = ref(false)
const resendText = ref('Resend Email')
const isResending = ref(false)

const togglePassword = () => {
  showPassword.value = !showPassword.value
}

const handleLogin = async () => {
  if (!identifier.value || !password.value) {
    window.$toast('Username or email and password are required', 'warning')
    return
  }

  if (password.value.length < 6) {
    window.$toast('Password must be at least 6 characters', 'warning')
    return
  }

  loading.value = true

  try {
    await login({ identifier: identifier.value, password: password.value })
    await loadUser() // ✅ Important: refresh global user after login

    window.$toast(`Welcome back`, 'success')
    await router.push('/dashboard')
  } catch (err) {
    const msg = err?.response?.data?.error || 'Login failed'
    window.$toast(msg, 'error')

    if (msg.toLowerCase().includes('not verified')) {
      showResend.value = true
    }
  } finally {
    loading.value = false
  }
}
const resendVerificationEmail = async () => {
  if (isResending.value || !identifier.value) return

  isResending.value = true
  resendText.value = 'Sending...'

  try {
    await resendVerification(identifier.value)
    window.$toast('Verification email resent', 'success')
  } catch (err) {
    const msg = err?.response?.data?.error || 'Failed to resend verification'
    window.$toast(msg, 'error')
  } finally {
    isResending.value = false
    resendText.value = 'Resend Email'
  }
}

const handleGoogle = () => {
  window.location.href = `${API}/api/v1/auth/google`
}

const handleGitHub = () => {
  window.location.href = `${API}/api/v1/auth/github`
}

onMounted(() => {
  if (route.query.oauth === 'error') {
    const msg = route.query.msg
      ? decodeURIComponent(route.query.msg)
      : 'OAuth login failed. Please try again.'
    window.$toast(msg, 'error')
    router.replace({ path: route.path })
  }
})
</script>