<template>
  <aside :class="['sidebar', { collapsed, mobile, open }]">
    <!-- Main Nav -->
    <nav class="nav" v-if="mounted">
      <router-link to="/dashboard" @click="handleLinkClick">
        <Home :size="20" />
        <span v-if="!collapsed">Dashboard</span>
      </router-link>

      <router-link to="/profile" @click="handleLinkClick">
        <User :size="20" />
        <span v-if="!collapsed">Profile</span>
      </router-link>

      <router-link to="/explore" @click="handleLinkClick">
        <CompassIcon :size="20" />
        <span v-if="!collapsed">Explore</span>
      </router-link>

      <router-link to="/docs" @click="handleLinkClick">
        <BookOpen :size="20" />
        <span v-if="!collapsed">Docs</span>
      </router-link>
    </nav>

    <!-- Footer: Always at bottom -->
    <div class="sidebar-footer">
      <button
        v-if="!mobile"
        class="collapse-toggle"
        @click="$emit('toggleCollapse')"
        :title="collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'"
      >
        <ChevronRight v-if="collapsed" :size="20" />
        <ChevronLeft v-else :size="20" />
      </button>

      <button v-if="mobile" class="close-btn" @click="$emit('closeMobile')">
        <X :size="20" />
      </button>
    </div>
  </aside>

  <!-- Backdrop for mobile -->
  <div v-if="mobile && open" class="backdrop" @click="$emit('closeMobile')"></div>
</template>

<script setup>
import {
  Home,
  BookOpen,
  User,
  CompassIcon,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-vue-next'
import { ref, onMounted } from 'vue'
import '@/assets/styles/components/sidebar.css'
const props = defineProps({
  collapsed: Boolean,
  mobile: Boolean,
  open: Boolean
})

const emit = defineEmits(['toggleCollapse', 'closeMobile'])

const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

function handleLinkClick() {
  if (props.mobile) {
    setTimeout(() => {
      emit('closeMobile')
    }, 100)
  }
}

function logout() {
  localStorage.removeItem('token')
  window.location.href = '/login'
}
</script>