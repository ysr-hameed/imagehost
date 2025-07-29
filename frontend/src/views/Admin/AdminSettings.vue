<template>
  <div class="admin-settings">
    <h2><Sparkles class="icon" /> App Settings</h2>

    <form @submit.prevent="saveSettings">
      <div class="form-grid">

        <!-- App Name -->
        <label>
          <span><Pencil class="icon" /> App Name</span>
          <input v-model="form.app_name" type="text" />
        </label>

        <!-- Tagline -->
        <label>
          <span><MessageSquare class="icon" /> Tagline</span>
          <input v-model="form.tagline" type="text" />
        </label>

        <!-- Description -->
        <label>
          <span><FileText class="icon" /> Description</span>
          <textarea v-model="form.description" rows="2" />
        </label>

        <!-- Support Email -->
        <label>
          <span><Mail class="icon" /> Support Email</span>
          <input v-model="form.support_email" type="email" />
        </label>

        <!-- Contact Phone -->
        <label>
          <span><Phone class="icon" /> Contact Phone</span>
          <input v-model="form.contact_phone" type="text" />
        </label>

        <!-- Theme Mode -->
        <label>
          <span><Moon class="icon" /> Theme Mode</span>
          <select v-model="form.theme_mode">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <!-- Default Language -->
        <label>
          <span><Globe class="icon" /> Default Language</span>
          <input v-model="form.default_language" type="text" />
        </label>

        <!-- Maintenance Mode -->
        <label class="checkbox">
          <input type="checkbox" v-model="form.maintenance_mode" />
          <AlertTriangle class="icon" />
          Maintenance Mode
        </label>

        <!-- Light Primary Color -->
        <label>
          <span><Sun class="icon" /> Light Primary Color</span>
          <div class="color-row">
            <input type="color" v-model="form.light_primary_color" />
            <input type="text" v-model="form.light_primary_color" class="color-code-input" />
            <div class="color-preview" :style="{ backgroundColor: form.light_primary_color }" />
          </div>
        </label>

        <!-- Dark Primary Color -->
        <label>
          <span><Moon class="icon" /> Dark Primary Color</span>
          <div class="color-row">
            <input type="color" v-model="form.dark_primary_color" />
            <input type="text" v-model="form.dark_primary_color" class="color-code-input" />
            <div class="color-preview" :style="{ backgroundColor: form.dark_primary_color }" />
          </div>
        </label>

        <!-- Favicon -->
        <label>
          <span><Image class="icon" /> Favicon</span>
          <input type="file" @change="handleFile($event, 'favicon')" />
          <input v-model="form.favicon_url" placeholder="Or paste image URL" />
          <img v-if="form.favicon_url" :src="form.favicon_url" class="preview" />
        </label>

        <!-- Logo -->
        <label>
          <span><Image class="icon" /> Logo</span>
          <input type="file" @change="handleFile($event, 'logo')" />
          <input v-model="form.logo_url" placeholder="Or paste image URL" />
          <img v-if="form.logo_url" :src="form.logo_url" class="preview" />
        </label>
      </div>

      <button type="submit"><UploadCloud class="icon" /> Save Settings</button>
    </form>
  </div>
</template>

<script>
import {
  getAdminSettings,
  updateAdminSettings,
  uploadFile
} from '@/api/admin'

import {
  Pencil,
  MessageSquare,
  FileText,
  Mail,
  Phone,
  Moon,
  Sun,
  Image,
  UploadCloud,
  AlertTriangle,
  Globe,
  Sparkles
} from 'lucide-vue-next'

export default {
  name: 'AdminSettings',
  components: {
    Pencil,
    MessageSquare,
    FileText,
    Mail,
    Phone,
    Moon,
    Sun,
    Image,
    UploadCloud,
    AlertTriangle,
    Globe,
    Sparkles
  },
  data() {
    return {
      form: {
        app_name: '',
        tagline: '',
        description: '',
        support_email: '',
        contact_phone: '',
        light_primary_color: '#4f46e5',
        dark_primary_color: '#0f172a',
        theme_mode: 'light',
        default_language: 'en',
        maintenance_mode: false,
        favicon_url: '',
        logo_url: ''
      }
    }
  },
  async mounted() {
    await this.fetchSettings()
  },
  methods: {
    async fetchSettings() {
      try {
        const data = await getAdminSettings()
        console.log('✅ Loaded settings:', data)

        Object.keys(this.form).forEach(key => {
          if (data[key] !== undefined) this.form[key] = data[key]
        })
      } catch (err) {
        console.error('❌ Failed to load settings:', err)
      }
    },
    async saveSettings() {
      try {
        const res = await updateAdminSettings(this.form)
        window.$toast(`Update Successfull`, 'success')
        await this.fetchSettings()
      } catch (err) {
        console.error('❌ Failed to save settings:', err)
      }
    },
    async handleFile(event, type) {
      const file = event.target.files[0]
      if (!file) return

      const formData = new FormData()
      formData.append('file', file)

      try {
        const result = await uploadFile(formData, type)
        if (type === 'favicon') this.form.favicon_url = result.url
        else this.form.logo_url = result.url
      } catch (err) {
        console.error('❌ Upload failed:', err)
      }
    }
  }
}
</script>

<style scoped>
.admin-settings {
  padding: 1.5rem;
  max-width: 960px;
  margin: auto;
}
h2 {
  font-size: 1.6rem;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.25rem;
}
label {
  display: flex;
  flex-direction: column;
  font-weight: 500;
  gap: 0.25rem;
}
input,
textarea,
select {
  padding: 0.5rem;
  font-size: 0.95rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--text-color);
}
textarea {
  resize: vertical;
}
button {
  margin-top: 2rem;
  padding: 0.7rem 1.2rem;
  font-weight: bold;
  font-size: 1rem;
  background: var(--primary);
  color: var(--white);
  border: none;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: var(--shadow);
  cursor: pointer;
}
.preview {
  max-height: 40px;
  margin-top: 0.4rem;
  border-radius: 4px;
}
.icon {
  width: 18px;
  height: 18px;
}
.checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}
.color-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.color-code-input {
  font-family: monospace;
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--text-color);
  width: 100%;
  max-width: 100px;
}
.color-preview {
  width: 32px;
  height: 32px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
</style>