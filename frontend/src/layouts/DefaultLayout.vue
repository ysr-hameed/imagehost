<template>
  <div class="layout">
    <!-- Sidebar (Fixed) -->
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
        <!-- Page content -->
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import '@/assets/styles/layout/default_and_admin_layout.css'
import Sidebar from '@/components/Sidebar.vue'
import Header from '@/components/Header.vue'

const sidebarCollapsed = ref(false)
const mobileOpen = ref(false)
const isMobile = ref(false)

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
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateScreenSize)
})
</script>
