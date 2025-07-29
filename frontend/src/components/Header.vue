<template>
  <header class="header">
    <div class="left">
      <button class="menu-btn" @click="$emit('toggleMobile')">
        <Menu v-if="!mobileOpen" :size="20" />
        <X v-else :size="20" />
      </button>

      <div class="logo">
        <AppWindow :size="22" />
        <span class="logo-text">{{ appSettings.app_name }}</span>
      </div>
    </div>

    <div class="right">
      <!-- ✅ Notification Icon with Badge -->
      <div class="notification-wrapper">
        <button class="header-icon-btn" @click="handleNotificationClick">
          <Bell :size="18" />
          <span v-if="notificationCount > 0" class="notification-badge">
            {{ notificationCount }}
          </span>
        </button>
      </div>

      <!-- ✅ Profile Dropdown -->
      <div class="profile" ref="dropdownRef">
        <button class="initials-circle" @click="toggleDropdown">
          <div class="initials-circle" v-if="user.loaded && initials">{{ initials }}</div>
          <User v-else :size="18" />
        </button>

        <div v-if="dropdownOpen" class="dropdown">
          <div class="dropdown-user-info" v-if="user.loaded">
            <div class="user-name">{{ user.first_name + " " + user.last_name }}</div>
            <div class="user-email">{{ user.email }}</div>
          </div>

          <hr class="dropdown-divider" />

          <router-link
            to="/settings"
            class="dropdown-item"
            @click="closeDropdown"
          >
            <Settings :size="16" class="icon" />
            Settings
          </router-link>

          <a
            href="#"
            @click.prevent="confirmLogout"
            class="dropdown-item logout-btn"
          >
            <LogOut :size="16" class="icon" />
            Logout
          </a>
        </div>
      </div>
    </div>

    <!-- Logout Modal -->
    <BaseModal
      v-if="showLogoutModal"
      title="Logout"
      confirmText="Logout"
      cancelText="Cancel"
      @confirm="handleLogout"
      @cancel="showLogoutModal = false"
    >
      <p>Are you sure you want to logout?</p>
    </BaseModal>
  </header>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Menu, X, Bell, User,
  Settings, LogOut, AppWindow
} from 'lucide-vue-next'
import BaseModal from '@/components/BaseModal.vue'
import { logout } from '@/api/user.js'
import { appSettings } from '@/stores/settings'
import { user } from '@/stores/user'
import { fetchUnreadCount } from '@/api/notifications.js'
import {
  notificationCount,
  setNotificationCount
} from '@/stores/notifications.js'
import '@/assets/styles/components/header.css'

defineProps({ mobileOpen: Boolean })

const router = useRouter()
const dropdownOpen = ref(false)
const dropdownRef = ref(null)
const showLogoutModal = ref(false)

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
}

function closeDropdown() {
  dropdownOpen.value = false
}

function confirmLogout() {
  closeDropdown()
  showLogoutModal.value = true
}

async function handleLogout() {
  try {
    await logout()
    window.location.href = '/login'
  } catch (err) {
    const msg = err?.response?.data?.message || 'Logout failed'
    window.$toast(msg, 'error')
  }
}

async function loadNotificationCount() {
  try {
    const count = await fetchUnreadCount()
    setNotificationCount(count)
  } catch (err) {
    console.error('Failed to fetch notification count', err)
  }
}

function handleNotificationClick() {
  router.push('/notifications')
}

function handleOutsideClick(e) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    dropdownOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('click', handleOutsideClick)
  loadNotificationCount()
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleOutsideClick)
})

const initials = computed(() => {
  if (!user.loaded || !user.username) return ''
  const parts = user.username.trim().split(' ')
  const first = parts[0]?.[0] || ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : ''
  return (first + last).toUpperCase()
})
</script>