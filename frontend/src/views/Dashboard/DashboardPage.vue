<template>
  <section class="dashboard">
    <Loader v-if="loading" />

    <div v-else-if="user.loaded">
      <h1>Hello {{ user.username }}</h1>
      <p>Your dashboard is working ✅</p>
    </div>

    <div v-else>
      <p>Failed to load your profile. Please <a href="/login">login again</a>.</p>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { user, loadUser } from '@/stores/user' 
import Loader from '@/components/global/Loader.vue'

const loading = ref(true)
const route = useRoute()
const router = useRouter()

onMounted(async () => {
  try {
    await loadUser()

    if (user.loaded && route.query.oauth === 'success') {
      window.$toast('Successfully logged in via OAuth', 'success')
      router.replace({ path: route.path }) // clean URL
    }

    if (!user.loaded) {
      throw new Error('User not loaded')
    }
  } catch (err) {
    console.error('Failed to load profile:', err)
    window.$toast('Failed to load your profile', 'error')
  } finally {
    loading.value = false
  }
})
</script>