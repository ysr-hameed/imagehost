// src/stores/settings.js

// how to use in any page
// import { appSettings } from '@/stores/settings'
// {{ appSettings.primary_color }}

import { reactive } from 'vue'

export const appSettings = reactive({
  app_name: 'Servoro',
  tagline: '',
  description: '',
  logo_url: '',
  favicon_url: '',
  light_primary_color: '',
  dark_primary_color: '',
  theme_mode: 'light',
  support_email: '',
  contact_phone: '',
  default_language: '',
  maintenance_mode: false,
  loaded: false
})