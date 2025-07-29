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
import Sidebar from '@/components/Sidebar.vue'
import Header from '@/components/Header.vue'

const sidebarCollapsed = ref(true)
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

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
}

.main {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding-top: 64px; /* height of the header */
  overflow-x: hidden;
}

.page-content {
  flex: 1;
  padding-left: 1rem;
  padding-right: 1rem;
  padding-block: 1rem;
  min-height: calc(100vh - 64px); /* header height */
  overflow-x: hidden;
}

@media (max-width: 767px) {
  .page-content {
    padding-left: 1rem;
    padding-right: 1rem;
    margin-left: 0 !important;
  }
}
</style>

<!-- Global overflow fix -->
<style>
html, body {
  margin: 0;
  padding: 0;
  overflow-x: hidden;
}
</style>