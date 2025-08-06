<template>
  <div class="login-page">
    <div class="content">
      <h1 class="title">SignUp</h1>
      <p class="sub">Sign up to manage your tasks, projects, and team all in one place.</p>

      <!-- OAUTH -->
      <div class="oauth-buttons">
        <button class="oauth" @click="handleGoogle">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 32 32" style="margin-right: 6px;">
            <path fill="currentColor"
              d="M 16.003906 14.0625 L 16.003906 18.265625 L 21.992188 18.265625 C 21.210938 20.8125 19.082031 22.636719 16.003906 22.636719 C 12.339844 22.636719 9.367188 19.664063 9.367188 16 C 9.367188 12.335938 12.335938 9.363281 16.003906 9.363281 C 17.652344 9.363281 19.15625 9.96875 20.316406 10.964844 L 23.410156 7.867188 C 21.457031 6.085938 18.855469 5 16.003906 5 C 9.925781 5 5 9.925781 5 16 C 5 22.074219 9.925781 27 16.003906 27 C 25.238281 27 27.277344 18.363281 26.371094 14.078125 Z" />
          </svg>
          Google
        </button>
        <button class="oauth" @click="handleGitHub">
          <Github :size="18" style="margin-right: 6px;" />
          GitHub
        </button>
      </div>

      <div class="divider"><span>or</span></div>

      <!-- NAME -->
      <div class="input-row">
        <div class="input-box half">
          <User class="icon" :size="18" />
          <input type="text" v-model="firstName" placeholder="First Name" autocomplete="given-name" />
        </div>
        <div class="input-box half">
          <User class="icon" :size="18" />
          <input type="text" v-model="lastName" placeholder="Last Name" autocomplete="family-name" />
        </div>
      </div>

      <!-- USERNAME -->
      <div class="input-box">
        <User class="icon" :size="18" />
        <input
          type="text"
          v-model="username"
          placeholder="Username"
          autocomplete="username"
          @blur="checkUsernameAvailability"
        />

      </div>

      <!-- EMAIL -->
      <div class="input-box">
        <Mail class="icon" :size="18" />
        <input
          type="email"
          v-model="email"
          placeholder="Email address"
          autocomplete="email"
        />

      </div>

      <!-- PASSWORD -->
      <div class="input-box password-box">
        <Lock class="icon" :size="18" />
        <input :type="showPassword ? 'text' : 'password'" v-model="password" placeholder="Password" autocomplete="new-password" />
        <component :is="showPassword ? EyeOff : Eye" class="eye-icon" :size="18" @click="togglePassword" />
      </div>

      <!-- CONFIRM -->
      <div class="input-box password-box">
        <Lock class="icon" :size="18" />
        <input :type="showConfirm ? 'text' : 'password'" v-model="confirmPassword" placeholder="Confirm Password" autocomplete="new-password" />
        <component :is="showConfirm ? EyeOff : Eye" class="eye-icon" :size="18" @click="toggleConfirm" />
      </div>

      <!-- TERMS -->
      <label class="terms">
        <input type="checkbox" v-model="acceptTerms" />
        <span>I accept the <a href="#">Terms & Conditions</a></span>
      </label>

      <!-- SUBMIT -->
      <button class="login-btn btn btn-primary" @click="handleSignup">
        <span v-if="!loading">Register</span>
        <ButtonLoader v-else :loading="true" />
      </button>

      <div class="signup">
        Already have an account? <router-link to="/login">Login here</router-link>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { User, Mail, Lock, Eye, EyeOff, Github } from 'lucide-vue-next'
import ButtonLoader from '@/components/ButtonLoader.vue'
import '@/assets/styles/pages/auth.css'
import { registerUser } from '@/api/user.js'

const router = useRouter()
const route = useRoute()

const firstName = ref('')
const lastName = ref('')
const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const acceptTerms = ref(false)

const showPassword = ref(false)
const showConfirm = ref(false)
const loading = ref(false)

const usernamePattern = /^[a-z0-9_]{1,12}$/

const togglePassword = () => {
  showPassword.value = !showPassword.value
}
const toggleConfirm = () => {
  showConfirm.value = !showConfirm.value
}

const checkUsernameAvailability = () => {
  if (!usernamePattern.test(username.value)) {
    window.$toast('Only lowercase letters, numbers, and one "_" allowed (max 12 characters)', 'warning')
  }
}

const handleSignup = async () => {
  if (!firstName.value || !lastName.value || !username.value || !email.value || !password.value || !confirmPassword.value) {
    window.$toast('All fields are required', 'warning')
    return
  }

  if (!usernamePattern.test(username.value)) {
    window.$toast('Invalid username format', 'warning')
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

  if (!acceptTerms.value) {
    window.$toast('You must accept the Terms & Conditions', 'warning')
    return
  }

  loading.value = true
  try {
    const payload = {
      first_name: firstName.value.trim(),
      last_name: lastName.value.trim(),
      username: username.value.trim(),
      email: email.value.trim().toLowerCase(),
      password: password.value
    }

    await registerUser(payload)

    router.push({ path: '/verify-notice', query: { email: email.value } })

    firstName.value = ''
    lastName.value = ''
    username.value = ''
    email.value = ''
    password.value = ''
    confirmPassword.value = ''
    acceptTerms.value = false

    window.$toast('Registration successful, check your email', 'success')
  } catch (err) {
    const msg = err?.response?.data?.error || 'Registration failed'
    window.$toast(msg, 'error') // always toast, no input errors
  } finally {
    loading.value = false
  }
}

const API = import.meta.env.VITE_API_BASE_URL
const handleGoogle = () => {
  window.location.href = `${API}/api/v1/auth/google`
}
const handleGitHub = () => {
  window.location.href = `${API}/api/v1/auth/github`
}

onMounted(() => {
  if (route.query.oauth === 'error') {
    const msg = route.query.msg ? decodeURIComponent(route.query.msg) : 'OAuth login failed. Please try again.'
    window.$toast(msg, 'error')
    router.replace({ path: route.path })
  }
})
</script>
<style scoped>
.error-text {
  font-size: 13px;
  color: red;
  margin-top: 4px;
}
</style>