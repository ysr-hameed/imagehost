<template>
  <div class="upload-page">
    <!-- Loader -->
    <Loader v-if="loading" />

    <template v-else>
      <h1 class="title">Upload File</h1>

      <!-- Dropzone -->
      <div
        class="file-dropzone"
        :class="{ dragging }"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
        @click="$refs.fileInput.click()"
      >
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          hidden
          @change="onFileChange"
        />

        <template v-if="files.length === 0">
          <UploadCloud class="icon-upload" />
          <p>Click or drag image(s) here to upload</p>
        </template>

        <div v-else class="file-grid">
          <div
            v-for="(file, idx) in files"
            :key="file.uniqueKey"
            class="file-card"
          >
            <img v-if="file.preview" :src="file.preview" class="thumb" />
            <div class="file-info">
              <span class="file-name">{{ file.name }}</span>
              <span class="file-size">{{ formatSize(file.size) }}</span>
            </div>
            <button class="remove-btn" @click.stop="removeFile(idx)">
              <XCircle />
            </button>
          </div>
        </div>
      </div>

      <!-- Filename -->
      <div class="grid-2">
        <label class="field">
          <span>
            Filename (optional)
            <span class="tooltip" @mouseenter="showTip('filename')" @mouseleave="hideTip">
              ?
              <div v-if="activeTip === 'filename'" class="tooltip-box">
                Leave empty to keep original filename, or enter a custom name.
              </div>
            </span>
          </span>
          <input
            type="text"
            v-model.trim="form.filename"
            placeholder="Leave empty for original filename"
          />
        </label>

        <!-- Expiry -->
        <label class="field">
          <span>
            Expiry Time
            <span class="tooltip" @mouseenter="showTip('expiry')" @mouseleave="hideTip">
              ?
              <div v-if="activeTip === 'expiry'" class="tooltip-box">
                Choose when this file should expire. "Never" means it will stay forever.
              </div>
            </span>
          </span>
          <Select
            v-model="expiryOption"
            :options="expiryOptions"
            placeholder="Select expiry"
          />

          <!-- Custom Expiry Selection -->
          <div v-if="expiryOption === 'custom'" class="custom-expiry">
            <input
              type="number"
              v-model.number="customExpiryValue"
              placeholder="Enter value"
              min="1"
            />
            <select v-model="customExpiryUnit">
              <option value="seconds">Seconds</option>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
              <option value="months">Months</option>
              <option value="years">Years</option>
            </select>
          </div>
        </label>
      </div>

      <!-- Advanced Options -->
      <div v-if="showAdvanced" class="advanced-fields">
        <div class="grid-2">
          <label class="field">
            <span>
              Path
              <span class="tooltip" @mouseenter="showTip('path')" @mouseleave="hideTip">
                ?
                <div v-if="activeTip === 'path'" class="tooltip-box">
                  Optional folder/subfolder where the file will be stored.
                </div>
              </span>
            </span>
            <input type="text" v-model.trim="form.path" placeholder="folder/subfolder" />
          </label>
          <label class="field">
            <span>
              Description
              <span class="tooltip" @mouseenter="showTip('description')" @mouseleave="hideTip">
                ?
                <div v-if="activeTip === 'description'" class="tooltip-box">
                  Short description to help identify the file.
                </div>
              </span>
            </span>
            <textarea v-model.trim="form.description" placeholder="Enter description"></textarea>
          </label>
        </div>
        <label class="field">
          <span>
            Tags
            <span class="tooltip" @mouseenter="showTip('tags')" @mouseleave="hideTip">
              ?
              <div v-if="activeTip === 'tags'" class="tooltip-box">
                Comma-separated keywords for searching or categorizing.
              </div>
            </span>
          </span>
          <input type="text" v-model.trim="form.tags" placeholder="tag1, tag2" />
        </label>
        <label class="field checkbox-field">
          <input type="checkbox" v-model="form.private" />
          <span>
            Make file private
            <span class="tooltip" @mouseenter="showTip('private')" @mouseleave="hideTip">
              ?
              <div v-if="activeTip === 'private'" class="tooltip-box">
                Private files require authentication to access.
              </div>
            </span>
          </span>
        </label>
      </div>

      <!-- Advanced toggle -->
      <button class="toggle-advanced" @click="showAdvanced = !showAdvanced">
        <Settings /> {{ showAdvanced ? "Hide Advanced Options" : "Show Advanced Options" }}
      </button>

      <!-- Upload Button -->
      <button
        class="btn btn-primary btn-upload fw"
        :disabled="uploading || files.length === 0 || !apiKey"
        @click="uploadFiles"
      >
        <Loader2 v-if="uploading" class="spin" /> Upload
      </button>

      <!-- Uploaded Files -->
      <div v-if="successFiles.length" class="uploaded-files">
        <h3>Uploaded Files</h3>
        <div class="uploaded-grid">
          <div v-for="(file, index) in successFiles" :key="file.id || index" class="uploaded-card">
            <div class="uploaded-info">
              <strong>{{ file.filename }}</strong>
              <span class="meta">
                {{ formatSize(file.size) }} • Path: {{ file.path }} •
                {{ file.private ? 'Private' : 'Public' }} • Uploaded in {{ file.uploadTime }}s
              </span>
              <a :href="file.url" target="_blank" class="file-link">{{ file.url }}</a>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import { ref, onMounted } from "vue";
import axios from "axios";
import { UploadCloud, XCircle, Loader2, Settings, Clock, Calendar, Timer } from "lucide-vue-next";
import { getApiKeys } from "@/api/apiKey";
import Loader from "@/components/Loader.vue";
import Select from "@/components/ui/Select.vue";

export default {
  components: { UploadCloud, XCircle, Loader2, Settings, Loader, Select },
  setup() {
    const dragging = ref(false);
    const files = ref([]);
    const expiryOption = ref("never");
    const customExpiryValue = ref(1);
    const customExpiryUnit = ref("days");

    const expiryOptions = [
      { value: "never", label: "Never Expire", icon: Clock },
      { value: "3600", label: "1 Hour", icon: Timer },
      { value: "86400", label: "1 Day", icon: Calendar },
      { value: "604800", label: "7 Days", icon: Calendar },
      { value: "custom", label: "Custom", icon: Timer },
    ];
    const showAdvanced = ref(false);
    const uploading = ref(false);
    const error = ref("");
    const successFiles = ref([]);
    const apiKey = ref("");
    const loading = ref(true);
    const activeTip = ref("");

    const form = ref({
      filename: "",
      path: "",
      description: "",
      tags: "",
      private: false,
      expire_delete: 0,
    });

    const formatSize = (bytes) => {
      if (!bytes) return "0 B";
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
    };

    const showTip = (tip) => {
      activeTip.value = tip;
    };

    const hideTip = () => {
      activeTip.value = "";
    };

    const convertCustomExpiryToSeconds = () => {
      const val = customExpiryValue.value;
      switch (customExpiryUnit.value) {
        case "minutes": return val * 60;
        case "hours": return val * 3600;
        case "days": return val * 86400;
        case "months": return val * 2592000;
        case "years": return val * 31536000;
        default: return val;
      }
    };

    const addFiles = (newFiles) => {
      newFiles.forEach((file) => {
        file.uniqueKey = Date.now() + Math.random();
        file.preview = URL.createObjectURL(file);
        files.value.push(file);
      });
    };

    const onFileChange = (e) => addFiles(Array.from(e.target.files));
    const onDrop = (e) => {
      dragging.value = false;
      addFiles(Array.from(e.dataTransfer.files));
    };
    const removeFile = (idx) => files.value.splice(idx, 1);

    const fetchApiKey = async () => {
      try {
        const { data } = await getApiKeys();
        if (Array.isArray(data) && data.length > 0) {
          const activeKey = data.find((k) => k.active) || data[0];
          apiKey.value = activeKey.apiKey || activeKey.key || "";
        } else if (data?.apiKey || data?.key) {
          apiKey.value = data.apiKey || data.key;
        } else {
          error.value = "No API keys found from server.";
        }
      } catch (err) {
        error.value = err.response?.data?.message || "Failed to fetch API key.";
      } finally {
        loading.value = false;
      }
    };

    const ensureFilenameWithExtension = (filename, originalFile) => {
      if (!filename) return "";
      if (filename.includes(".")) return filename;
      const originalExt = originalFile.name.split(".").pop();
      return `${filename}.${originalExt}`;
    };

    const uploadFiles = async () => {
      if (!apiKey.value) {
        window.$toast("API key is missing. Cannot upload.", "error");
        return;
      }
      uploading.value = true;
      successFiles.value = [];

      const uploadUrl = import.meta.env.VITE_UPLOAD_URL || "/upload";

      try {
        for (let file of files.value) {
          const start = Date.now();
          const formData = new FormData();
          const finalFilename = ensureFilenameWithExtension(form.value.filename, file);
          if (finalFilename) formData.append("filename", finalFilename);

          formData.append("file", file);
          if (form.value.path) formData.append("path", form.value.path);
          if (form.value.description) formData.append("description", form.value.description);
          if (form.value.tags) formData.append("tags", form.value.tags);
          if (form.value.private) formData.append("private", "true");

          if (expiryOption.value === "custom") {
            formData.append("expire_delete", convertCustomExpiryToSeconds());
          } else if (expiryOption.value !== "never") {
            formData.append("expire_delete", expiryOption.value);
          }

          const { data } = await axios.post(uploadUrl, formData, {
            headers: { "x-api-key": apiKey.value },
          });

          const uploadTime = ((Date.now() - start) / 1000).toFixed(2);

          if (data?.files && Array.isArray(data.files)) {
            data.files.forEach((f) => {
              successFiles.value.push({ ...f, uploadTime });
            });
          }
        }

        files.value = [];
        window.$toast("Files uploaded successfully!", "success");
      } catch (err) {
        window.$toast(err.response?.data?.message || err.message, "error");
      } finally {
        uploading.value = false;
      }
    };

    onMounted(fetchApiKey);

    return {
      dragging,
      files,
      form,
      expiryOption,
      expiryOptions,
      customExpiryValue,
      customExpiryUnit,
      showAdvanced,
      uploading,
      error,
      successFiles,
      apiKey,
      loading,
      activeTip,
      formatSize,
      onFileChange,
      onDrop,
      removeFile,
      uploadFiles,
      showTip,
      hideTip,
    };
  },
};
</script>

<style scoped>
/* Dropzone */
.upload-page {
  max-width: 950px;
  margin: 0 auto;
  padding: 2rem;
  font-family: var(--font-main);
}
.title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  text-align: center;
}
.file-dropzone {
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  background: var(--bg);
  transition: all 0.3s ease;
}
.file-dropzone.dragging {
  border-color: var(--primary);
  background-color: var(--bg-secondary);
}
.icon-upload {
  width: 50px;
  height: 50px;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

/* File Grid */
.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}
.file-card {
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-card);
}
.file-card .thumb {
  width: 100%;
  height: 120px;
  object-fit: cover;
}
.file-info {
  padding: 0.5rem;
  text-align: center;
  font-size: 0.85rem;
}
.file-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-size {
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.remove-btn {
  position: absolute;
  top: 5px;
  right: 5px;
  background: var(--bg);
  border: none;
  border-radius: 50%;
  padding: 4px;
  cursor: pointer;
}

/* Fields */
.field {
  display: flex;
  flex-direction: column;
  margin-top: 1rem;
}
.field span {
  font-size: 0.9rem;
  font-weight: 500;
  margin-bottom: 0.3rem;
}
input, textarea, select {
  padding: 0.5rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text);
}
input:focus, textarea:focus, select:focus {
  border-color: var(--primary);
}
.checkbox-field {
  flex-direction: row;
  align-items: center;
}

/* Grid */
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

/* Buttons */
.toggle-advanced {
  margin-top: 1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  border-radius: var(--radius);
  cursor: pointer;
}
.btn-upload {
  margin-top: 1.5rem;
  width: 100%;
  height: 45px;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Tooltip */
.tooltip {
  display: inline-block;
  margin-left: 4px;
  cursor: pointer;
  background: var(--primary);
  color: var(--white);
  font-size: 0.7rem;
  padding: 0 4px;
  border-radius: 50%;
  position: relative;
}
.tooltip-box {
  position: absolute;
  top: 120%;
  left: 0;
  background: var(--bg-card);
  color: var(--text);
  padding: 6px 8px;
  border-radius: var(--radius);
  font-size: 0.75rem;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  white-space: normal;
  width: 180px;
  z-index: 10;
}

/* Uploaded */
.uploaded-files {
  margin-top: 2rem;
  background: var(--bg-card);
  padding: 1rem;
  border-radius: var(--radius);
}
.uploaded-grid {
  display: grid;
  gap: 0.8rem;
}
.uploaded-card {
  padding: 0.8rem;
  background: var(--bg);
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.uploaded-info strong {
  font-weight: 600;
  color: var(--primary);
}
.meta {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.file-link {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.8rem;
  color: var(--primary);
  word-break: break-all;
}

/* Loader spin */
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>