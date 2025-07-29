<template>
  <aside :class="['sidebar', { collapsed, mobile, open }]">
    <div class="scroll-area" v-if="mounted">
      <nav class="nav">
        <router-link to="/admin" @click="handleLinkClick">
          <LayoutDashboard :size="20" />
          <span v-if="!collapsed">Dashboard</span>
        </router-link>

        <router-link to="/admin/users" @click="handleLinkClick">
          <Users :size="20" />
          <span v-if="!collapsed">Users</span>
        </router-link>

        <router-link to="/admin/settings" @click="handleLinkClick">
          <Settings :size="20" />
          <span v-if="!collapsed">Settings</span>
        </router-link>
        <router-link to="/admin/notifications" @click="handleLinkClick">
          <Settings :size="20" />
          <span v-if="!collapsed">Notification</span>
        </router-link>
        <router-link to="/admin/logs" @click="handleLinkClick">
          <List :size="20" />
          <span v-if="!collapsed">Logs</span>
        </router-link>
      </nav>
    </div>

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

  <div v-if="mobile && open" class="backdrop" @click="$emit('closeMobile')"></div>
</template>

<script setup>
import {
  LayoutDashboard,
  Users,
  Settings,
  List,
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
</script>