<template>
  <div class="login-page">
    <div class="content">
      <h1 class="title">Resend Verification Email</h1>
      <p class="sub">Didn't receive the email? Enter your email to send it again.</p>

      <!-- Email Input -->
      <div class="input-box">
        <Mail class="icon" :size="18" />
        <input
          v-model="email"
          type="email"
          placeholder="Email address"
          autocomplete="email"
        />
      </div>

      <!-- Submit Button -->
      <button class="login-btn btn btn-primary" @click="handleResend">
        <span v-if="!loading">Send Again</span>
        <ButtonLoader v-else :loading="true" />
      </button>

      <!-- Link to Login -->
      <div class="signup">
        Already verified? <router-link to="/login">Login now</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Mail } from 'lucide-vue-next'
import ButtonLoader from '@/components/ButtonLoader.vue'
import '@/assets/styles/pages/auth.css'
import axios from 'axios'

const email = ref('')
const loading = ref(false)
const API = import.meta.env.VITE_API_BASE_URL

const handleResend = async () => {
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())

  if (!email.value || !isValidEmail) {
    window.$toast('Enter a valid email address', 'warning')
    return
  }

  loading.value = true
  try {
    await axios.post(`${API}/resend-verification`, {
      email: email.value.trim().toLowerCase()
    })
    window.$toast('Verification email resent successfully', 'success')
  } catch (err) {
    const msg = err?.response?.data?.error || 'Unable to resend verification link'
    window.$toast(msg, 'error')
  } finally {
    loading.value = false
  }
}
</script>