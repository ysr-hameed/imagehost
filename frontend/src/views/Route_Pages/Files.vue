<script setup>
import { ref, onMounted } from "vue";
import { Image, Upload, Trash2, KeyRound, RefreshCcw } from "lucide-vue-next";
import { getApiKeys } from "@/api/apiKey"; // your existing API key fetch function

const apiBase = "http://localhost:4000"; // Change to your API server
const apiKey = ref("");
const images = ref([]);
const loading = ref(false);
const error = ref("");
const selectedFile = ref(null);
const isPrivate = ref(false);
const uploading = ref(false);
const selectedImage = ref(null);

const fetchApiKey = async () => {
  try {
    const { data } = await getApiKeys();
    if (Array.isArray(data) && data.length > 0) {
      const activeKey = data.find((k) => k.active) || data[0];
      apiKey.value = activeKey.apiKey || activeKey.key || "";
    } else {
      error.value = "No API keys found.";
    }
  } catch (err) {
    console.error("Failed to fetch API keys:", err);
    error.value = "Failed to fetch API key.";
  }
};

const fetchImages = async () => {
  if (!apiKey.value) return;
  loading.value = true;
  try {
    const res = await fetch(`${apiBase}/images`, {
      headers: { "x-api-key": apiKey.value }
    });
    const json = await res.json();
    if (json.ok) {
      images.value = json.images || [];
    } else {
      error.value = json.error || "Failed to load images.";
    }
  } catch (err) {
    error.value = "Error loading images.";
  } finally {
    loading.value = false;
  }
};

const uploadImage = async () => {
  if (!selectedFile.value) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append("file", selectedFile.value);
    const res = await fetch(`${apiBase}/images?is_private=${isPrivate.value}`, {
      method: "POST",
      headers: { "x-api-key": apiKey.value },
      body: form
    });
    const json = await res.json();
    if (json.ok) {
      images.value.unshift(...json.uploaded);
      selectedFile.value = null;
    } else {
      error.value = json.error || "Upload failed.";
    }
  } catch (err) {
    error.value = "Error uploading image.";
  } finally {
    uploading.value = false;
  }
};

const deleteImage = async (id) => {
  if (!confirm("Are you sure you want to delete this image?")) return;
  try {
    await fetch(`${apiBase}/images/${id}`, {
      method: "DELETE",
      headers: { "x-api-key": apiKey.value }
    });
    images.value = images.value.filter(img => img.id !== id);
  } catch (err) {
    error.value = "Error deleting image.";
  }
};

const getPrivateToken = async (id) => {
  try {
    const res = await fetch(`${apiBase}/images/${id}/token?expire_seconds=3600`, {
      headers: { "x-api-key": apiKey.value }
    });
    const json = await res.json();
    if (json.ok) {
      alert(`Private token URL:\n${json.url}`);
    } else {
      alert(json.error || "Failed to get token.");
    }
  } catch {
    alert("Error getting token.");
  }
};

onMounted(async () => {
  await fetchApiKey();
  await fetchImages();
});
</script>

<template>
  <div class="file-manager">
    <header>
      <h1><Image size="20" /> My File Manager</h1>
      <button @click="fetchImages" title="Refresh"><RefreshCcw size="18" /></button>
    </header>

    <section class="upload-section">
      <input type="file" @change="e => selectedFile.value = e.target.files[0]" />
      <label>
        <input type="checkbox" v-model="isPrivate" /> Private
      </label>
      <button @click="uploadImage" :disabled="uploading || !selectedFile">
        <Upload size="16" /> {{ uploading ? 'Uploading...' : 'Upload' }}
      </button>
    </section>

    <section v-if="loading">Loading images...</section>
    <section v-if="error" class="error">{{ error }}</section>

    <div class="grid">
      <div v-for="img in images" :key="img.id" class="card">
        <img :src="img.url" :alt="img.filename" @click="selectedImage = img" />
        <div class="card-footer">
          <span>{{ img.filename }}</span>
          <div class="actions">
            <button @click="deleteImage(img.id)"><Trash2 size="14" /></button>
            <button v-if="img.is_private" @click="getPrivateToken(img.id)">
              <KeyRound size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedImage" class="modal" @click.self="selectedImage = null">
      <div class="modal-content">
        <h2>{{ selectedImage.filename }}</h2>
        <img :src="selectedImage.url" :alt="selectedImage.filename" />
        <p>Size: {{ (selectedImage.size / 1024).toFixed(2) }} KB</p>
        <p>Private: {{ selectedImage.is_private }}</p>
        <button @click="selectedImage = null">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-manager {
  --bg: var(--background, #fff);
  --fg: var(--foreground, #222);
  --primary: var(--primary, #007bff);
  font-family: sans-serif;
  color: var(--fg);
  background: var(--bg);
  padding: 1rem;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.upload-section {
  margin: 1rem 0;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.error {
  color: red;
  margin: 0.5rem 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}
.card {
  background: var(--card-bg, #f9f9f9);
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.card img {
  width: 100%;
  height: 140px;
  object-fit: cover;
  cursor: pointer;
}
.card-footer {
  padding: 0.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.actions {
  display: flex;
  gap: 0.25rem;
}
.actions button {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--primary);
}
.modal {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background: rgba(0,0,0,0.6);
  display: flex;
  justify-content: center;
  align-items: center;
}
.modal-content {
  background: var(--bg);
  padding: 1rem;
  border-radius: 8px;
  max-width: 90%;
  max-height: 90%;
  overflow: auto;
}
.modal-content img {
  max-width: 100%;
}
</style>