<template>
 <Loader v-if="!appSettings.loaded" />
  <!-- ✅ Use layout only if meta.layout === 'default' -->
  <component v-else :is="layoutComponent">
    <router-view />
  </component>

  <!-- ✅ Global toast system -->
  <Toast ref="toastRef" />
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { appSettings } from '@/stores/settings'

import DefaultLayout from '@/layouts/DefaultLayout.vue'
import Toast from '@/components/Toast.vue'
import Loader from '@/components/Loader.vue'

const route = useRoute()
const toastRef = ref(null)

// 🔥 Global toast access for anywhere
window.$toast = (...args) => toastRef.value?.addToast(...args)

// Dynamically pick layout from route meta
const layoutComponent = computed(() =>
  route.meta.layout === 'default' ? DefaultLayout : 'div'
)
</script>