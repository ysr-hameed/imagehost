<template>
  <div class="login-page">
    <div class="content">
      <h1 class="title">Forgot Password</h1>
      <p class="sub">We'll send a link to reset your password to your email.</p>

      <div class="input-box">
        <Mail class="icon" :size="20" />
        <input
          type="email"
          v-model="email"
          placeholder="Enter your email"
          autocomplete="email"
        />
      </div>

      <button class="login-btn btn btn-primary" @click="handleSubmit">
        <span v-if="!loading">Send Reset Link</span>
        <ButtonLoader v-else :loading="loading" />
      </button>

      <div class="signup">
        Remember your password? <a href="/login">Login</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Mail } from 'lucide-vue-next'
import ButtonLoader from '@/components/ButtonLoader.vue'
import '@/assets/styles/pages/auth.css'
import { forgotPassword } from '@/api/user.js' // ✅ Import only needed function

const email = ref('')
const loading = ref(false)
const router = useRouter()

const handleSubmit = async () => {
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)
  if (!email.value || !isValid) {
    window.$toast('Enter a valid email address', 'warning')
    return
  }

  loading.value = true
  try {
    await forgotPassword(email.value)
    window.$toast('Reset link sent to your email', 'success')
  } catch (err) {
    const msg = err?.response?.data?.error || 'Something went wrong'
    window.$toast(msg, 'error')
  } finally {
    loading.value = false
  }
}
</script>