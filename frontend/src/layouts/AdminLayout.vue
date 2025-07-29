<template>
  <div class="layout" v-if="mounted">
    <!-- Sidebar -->
    <Sidebar
      :collapsed="sidebarCollapsed"
      :mobile="isMobile"
      :open="mobileOpen"
      @toggleCollapse="toggleCollapse"
      @closeMobile="mobileOpen = false"
    />

    <!-- Main Content Area -->
    <div class="main">
      <!-- Header -->
      <Header :mobileOpen="mobileOpen" @toggleMobile="mobileOpen = !mobileOpen" />

      <!-- Page Content Area -->
      <div
        class="page-content"
        :style="{ marginLeft: isMobile ? '0' : sidebarCollapsed ? '75px' : '250px' }"
      >
        <div v-if="loading" class="page-loader">
          <div class="spinner" />
        </div>

        <router-view v-else />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import Sidebar from '@/components/AdminSidebar.vue'
import Header from '@/components/Header.vue'
import '@/assets/styles/layout/default-admin-layout.css'

const sidebarCollapsed = ref(true)
const mobileOpen = ref(false)
const isMobile = ref(false)
const mounted = ref(false)

const toggleCollapse = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem('sidebar-collapsed', sidebarCollapsed.value)
}

function updateScreenSize() {
  isMobile.value = window.innerWidth < 768
  if (isMobile.value) {
    sidebarCollapsed.value = false
  }
}

onMounted(() => {
  const saved = localStorage.getItem('sidebar-collapsed')
  if (saved !== null) {
    sidebarCollapsed.value = saved === 'true'
  }

  updateScreenSize()
  window.addEventListener('resize', updateScreenSize)

  mounted.value = true
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateScreenSize)
})

// 🔄 Page content loader on route change
const loading = ref(false)
const router = useRouter()

router.beforeEach((to, from, next) => {
  loading.value = true
  next()
})
router.afterEach(() => {
  setTimeout(() => {
    loading.value = false
  }, 300)
})
</script>