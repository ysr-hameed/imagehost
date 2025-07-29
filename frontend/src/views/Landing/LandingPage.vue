<template>
  <Loader v-if="loading" />

  <div v-else class="landing">
    <!-- HEADER -->
    <div class="landing-header">
      <div class="landing-logo">
        <LayoutDashboard class="icon" />
        <span>{{ appSettings.app_name }}</span>
      </div>
      <nav class="landing-nav" :class="{ open: menuOpen }">
        <a href="#features">Features</a>
        <a href="#how">How It Works</a>
        <a href="#stats">Site Stats</a>
        <a href="#contact">Contact</a>
      </nav>
      <div class="landing-menu-icon" @click="toggleMenu">
        <component :is="menuOpen ? X : Menu" class="icon" />
      </div>
    </div>

    <!-- HERO -->
    <section class="landing-hero">
      <div class="landing-hero-content">
        <h1>Build your startup with real people</h1>
        <p>Your entire SaaS launch stack in one clean platform.</p>
        <button class="landing-btn" @click="handleGetStarted">
          <Rocket class="icon" />
          {{ isLoggedIn ? 'Go to Dashboard' : 'Get Started' }}
        </button>
      </div>
    </section>

    <!-- FEATURES -->
    <section id="features" class="landing-features">
      <h2>Everything You Need</h2>
      <div class="landing-features-grid">
        <div class="landing-feature">
          <Zap class="icon-lg" />
          <h3>Fast Deploy</h3>
          <p>Ship in minutes not weeks with zero-config hosting.</p>
        </div>
        <div class="landing-feature">
          <ShieldCheck class="icon-lg" />
          <h3>Secure Auth</h3>
          <p>Cookie-based JWT with social and email login.</p>
        </div>
        <div class="landing-feature">
          <Settings class="icon-lg" />
          <h3>Fully Custom</h3>
          <p>Bring your code, tools, and logic — we scale it.</p>
        </div>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section id="how" class="landing-timeline">
      <h2>How It Works</h2>
      <div class="landing-timeline-grid">
        <div class="landing-step">
          <Terminal class="icon" />
          <h3>Connect</h3>
          <p>Auth, database, payments — all connected fast.</p>
        </div>
        <div class="landing-step">
          <Cpu class="icon" />
          <h3>Build</h3>
          <p>Use your framework, our infra.</p>
        </div>
        <div class="landing-step">
          <Upload class="icon" />
          <h3>Launch</h3>
          <p>Push and go live instantly with CI/CD built-in.</p>
        </div>
      </div>
    </section>




    <!-- CTA -->
    <section class="landing-cta">
      <h2>Ready to launch?</h2>
      <p>Join a growing solo dev movement and build with speed.</p>
      <button class="landing-btn-light" @click="handleGetStarted">
        <UserPlus class="icon" />
        {{ isLoggedIn ? 'Go to Dashboard' : 'Get Started Free' }}
      </button>
    </section>

    <!-- FOOTER -->
    <footer class="landing-footer">
      <div class="landing-footer-top">
        <div class="landing-logo">
          <LayoutDashboard class="icon" />
          <span>{{ appSettings.app_name }}</span>
        </div>
        <div class="landing-footer-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Support</a>
        </div>
      </div>
      <div class="landing-footer-bottom">
        <p>© 2025 {{ appSettings.app_name }}. All rights reserved.</p>
      </div>
    </footer>
  </div>
</template>
<script setup>
import {
  LayoutDashboard,
  Rocket,
  UserPlus,
  Zap,
  ShieldCheck,
  Settings,
  Terminal,
  Cpu,
  Upload,
  Users,
  Menu,
  X
} from 'lucide-vue-next'

import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getCurrentUser } from '@/api/user.js'

import { appSettings } from '@/stores/settings'
import '@/assets/styles/landing-page/index.css'
import Loader from '@/components/global/Loader.vue' // ✅ Your global loader

// ✅ Local state
const router = useRouter()
const menuOpen = ref(false)
const isLoggedIn = ref(false)
const stats = ref({})
const loading = ref(true) // 🔁 Full-page loader state

// ✅ Handle mobile menu toggle
const toggleMenu = () => {
  menuOpen.value = !menuOpen.value
  document.body.style.overflow = menuOpen.value ? 'hidden' : ''
}

// ✅ Handle CTA button click
const handleGetStarted = () => {
  router.push(isLoggedIn.value ? '/dashboard' : '/register')
}

// ✅ Fetch current user and stats on page load
onMounted(async () => {
  try {
    const user = await getCurrentUser()
    isLoggedIn.value = !!user?.email
  } catch {
    isLoggedIn.value = false
  }

  

  loading.value = false // ✅ Done loading
})
</script>