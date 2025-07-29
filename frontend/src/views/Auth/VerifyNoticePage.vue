<template>
  <div class="login-page">
    <div class="content">
      <h1 class="title">Verify Your Email</h1>
      <p class="sub">
        A verification email has been sent to
        <strong>{{ identifier }}</strong>. <br />
        Please check your inbox and click the link to activate your account.
      </p>

      <button class="login-btn btn btn-primary" @click="handleResend">
        <span v-if="!loading">Resend Verification Email</span>
        <ButtonLoader v-else :loading="true" />
      </button>

      <div class="signup">
        Already verified?
        <router-link to="/login">Login here</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import ButtonLoader from '@/components/ButtonLoader.vue'
import axios from 'axios'

const API = import.meta.env.VITE_API_BASE_URL
const route = useRoute()

// Use identifier from query param (email or username)
const identifier = ref(route.query.email || route.query.username || '')
const loading = ref(false)

const handleResend = async () => {
  if (!identifier.value) {
    window.$toast('Missing email or username', 'warning')
    return
  }

  loading.value = true
  try {
    await axios.post(`${API}/resend-verification`, {
      identifier: identifier.value.trim().toLowerCase()
    })
    window.$toast('Verification email resent successfully', 'success')
  } catch (err) {
    const msg = err?.response?.data?.error || 'Failed to resend verification email'
    window.$toast(msg, 'error')
  } finally {
    loading.value = false
  }
}
</script>