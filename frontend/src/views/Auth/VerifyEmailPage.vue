<template>
  <div class="login-page">
    <div class="content space">
      <h1 class="title">Verifying...</h1>
      <p class="sub">Please wait while we verify your email.</p>
      <ButtonLoader :loading="true" />
    </div>
  </div>
</template>

<style scoped>
.space {
  padding: 15px;
}
</style>

<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import ButtonLoader from '@/components/ButtonLoader.vue'

const API = import.meta.env.VITE_API_BASE_URL
const route = useRoute()
const router = useRouter()

onMounted(async () => {
  const token = route.query.token

  if (!token) {
    window.$toast('Invalid or missing token', 'error')
    router.push('/login')
    return
  }

  try {
    await axios.get(`${API}/verify-email`, {
      params: { token },
      withCredentials: true
    })

    window.$toast('Email verified successfully', 'success')
    router.push('/dashboard') // ✅ redirect after success
  } catch (err) {
    const msg = err?.response?.data?.error || 'Verification failed'
    window.$toast(msg, 'error')
    router.push('/login')
  }
})
</script>