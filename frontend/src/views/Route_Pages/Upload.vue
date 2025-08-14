<template>
  <div class="upload-page">
    <h1 class="title">Upload File</h1>
<p v-if="!loadingApiKey">Current API key: {{ apiKey }}</p>
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
    <label class="field">
      <span>Filename (optional)</span>
      <input
        type="text"
        v-model.trim="form.filename"
        placeholder="Leave empty for original filename"
      />
    </label>

    <!-- Expiry -->
    <label class="field">
      <span>Expiry Time</span>
      <select v-model="expiryOption" @change="onExpiryChange">
        <option value="never">Never Expire</option>
        <option value="3600">1 Hour</option>
        <option value="86400">1 Day</option>
        <option value="604800">7 Days</option>
        <option value="custom">Custom (seconds)</option>
      </select>
      <input
        v-if="expiryOption === 'custom'"
        type="number"
        v-model.number="form.expire_delete"
        placeholder="Enter seconds"
        min="0"
      />
    </label>

    <!-- Advanced Options -->
    <button class="toggle-advanced" @click="showAdvanced = !showAdvanced">
      <Settings /> {{ showAdvanced ? "Hide Advanced Options" : "Show Advanced Options" }}
    </button>

    <div v-if="showAdvanced" class="advanced-fields">
      <label class="field">
        <span>Path</span>
        <input type="text" v-model.trim="form.path" placeholder="folder/subfolder" />
      </label>
      <label class="field">
        <span>Description</span>
        <textarea v-model.trim="form.description" placeholder="Enter description"></textarea>
      </label>
      <label class="field">
        <span>Tags</span>
        <input type="text" v-model.trim="form.tags" placeholder="tag1, tag2" />
      </label>
      <label class="field checkbox-field">
        <input type="checkbox" v-model="form.private" />
        <span>Make file private</span>
      </label>
    </div>

    <!-- Upload Button -->
    <button
      class="btn-upload"
      :disabled="uploading || files.length === 0 || loadingApiKey || !apiKey"
      @click="uploadFiles"
    >
      <Loader2 v-if="uploading" class="spin" /> Upload
    </button>

    <!-- Progress -->
    <div class="progress" v-if="uploading || progress > 0">
      <div class="progress-bar" :style="{ width: progress + '%' }"></div>
    </div>

    <!-- Error -->
    <div v-if="error" class="error">{{ error }}</div>

    <!-- Success -->
<div v-if="successFiles.length" class="uploaded-files">
  <h3>Uploaded Files</h3>
  <ul>
    <li v-for="(file, index) in successFiles" :key="file.id || index">
      <strong>{{ file.filename }}</strong> ({{ formatSize(file.size) }})
      <br />
      <a :href="file.url" target="_blank">{{ file.url }}</a>
      <br />
      Path: {{ file.path }} | Private: {{ file.private }}
    </li>
  </ul>
</div>
  </div>
</template>

<script>
import { ref, onMounted } from "vue";
import axios from "axios";
import { UploadCloud, XCircle, Loader2, Settings } from "lucide-vue-next";
import { getApiKeys } from "@/api/apiKey";

export default {
  components: { UploadCloud, XCircle, Loader2, Settings },
  setup() {
    const dragging = ref(false);
    const files = ref([]);
    const expiryOption = ref("never");
    const showAdvanced = ref(false);
    const uploading = ref(false);
    const progress = ref(0);
    const error = ref("");
    const successFiles = ref([]);
    const apiKey = ref("");
    const loadingApiKey = ref(true);
    const statusLogs = ref([]); // NEW: log messages for UI

    const form = ref({
      filename: "",
      path: "",
      description: "",
      tags: "",
      private: false,
      expire_delete: 0,
    });

    const logStatus = (msg) => {
      console.log(msg);
      statusLogs.value.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    };

    const formatSize = (bytes) => {
      if (!bytes) return "0 B";
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
    };

    const addFiles = (newFiles) => {
      newFiles.forEach((file) => {
        file.uniqueKey = Date.now() + Math.random();
        file.preview = URL.createObjectURL(file);
        files.value.push(file);
        logStatus(`Added file: ${file.name} (${formatSize(file.size)})`);
      });
    };

    const onFileChange = (e) => addFiles(Array.from(e.target.files));
    const onDrop = (e) => {
      dragging.value = false;
      addFiles(Array.from(e.dataTransfer.files));
    };
    const removeFile = (idx) => {
      logStatus(`Removed file: ${files.value[idx].name}`);
      files.value.splice(idx, 1);
    };

    const onExpiryChange = () => {
      if (expiryOption.value !== "custom" && expiryOption.value !== "never") {
        form.value.expire_delete = Number(expiryOption.value);
      } else if (expiryOption.value === "never") {
        form.value.expire_delete = 0;
      }
      logStatus(`Expiry option changed to: ${expiryOption.value}`);
    };

    const fetchApiKey = async () => {
      loadingApiKey.value = true;
      try {
        logStatus("Fetching API key...");
        const { data } = await getApiKeys();
        if (Array.isArray(data) && data.length > 0) {
          const activeKey = data.find((k) => k.active) || data[0];
          apiKey.value = activeKey.apiKey || activeKey.key || "";
        } else if (data?.apiKey || data?.key) {
          apiKey.value = data.apiKey || data.key;
        } else {
          error.value = "No API keys found from server.";
          logStatus(error.value);
        }
        logStatus(`API key fetched: ${apiKey.value}`);
      } catch (err) {
        console.error("Failed to fetch API keys:", err);
        error.value = err.response?.data?.message || "Failed to fetch API key.";
        logStatus(`Error fetching API key: ${error.value}`);
      } finally {
        loadingApiKey.value = false;
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
    error.value = "API key is missing. Cannot upload.";
    return;
  }

  try {
    uploading.value = true;
    error.value = "";
    progress.value = 0;
    successFiles.value = [];

    const uploadUrl = import.meta.env.VITE_UPLOAD_URL || "/upload";

    for (let file of files.value) {
      const formData = new FormData();
      const finalFilename = ensureFilenameWithExtension(form.value.filename, file);
      if (finalFilename) formData.append("filename", finalFilename);

      formData.append("file", file);
      if (form.value.path) formData.append("path", form.value.path);
      if (form.value.description) formData.append("description", form.value.description);
      if (form.value.tags) formData.append("tags", form.value.tags);
      if (form.value.private) formData.append("private", "true");
      if (form.value.expire_delete) formData.append("expire_delete", form.value.expire_delete);

      console.log(`📤 Uploading ${file.name} (${formatSize(file.size)}) to ${uploadUrl}`);

      const { data } = await axios.post(uploadUrl, formData, {
        headers: { "x-api-key": apiKey.value },
        onUploadProgress: (e) => {
          if (e.total) {
            progress.value = Math.round((e.loaded * 100) / e.total);
          }
        },
      });

      console.log("✅ Upload response:", data);

      // Handle your backend's structure
      if (data?.files && Array.isArray(data.files)) {
        successFiles.value.push(...data.files);
      } else {
        console.warn("Unexpected upload response format:", data);
      }
    }

    files.value = [];
  } catch (err) {
    console.error("❌ Upload error:", err);
    error.value = err.response?.data?.message || err.message;
  } finally {
    uploading.value = false;
    progress.value = 0;
  }
};

    onMounted(fetchApiKey);

    return {
      dragging,
      files,
      form,
      expiryOption,
      showAdvanced,
      uploading,
      progress,
      error,
      successFiles,
      loadingApiKey,
      apiKey,
      statusLogs,
      formatSize,
      onFileChange,
      onDrop,
      removeFile,
      onExpiryChange,
      uploadFiles,
    };
  },
};
</script>

<style scoped>
/* same CSS as your previous snippet */
.upload-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
  font-family: system-ui, sans-serif;
  color: #222;
}

.title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  text-align: center;
}

/* Dropzone */
.file-dropzone {
  border: 2px dashed #bbb;
  border-radius: 10px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: #fafafa;
}

.file-dropzone.dragging {
  border-color: #4a90e2;
  background-color: #f0f7ff;
}

.file-dropzone .icon-upload {
  width: 50px;
  height: 50px;
  color: #777;
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
  border: 1px solid #ddd;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.08);
}

.file-card .thumb {
  display: block;
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
  display: block;
  font-weight: 500;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  font-size: 0.75rem;
  color: #666;
}

.remove-btn {
  position: absolute;
  top: 5px;
  right: 5px;
  background: rgba(255,255,255,0.85);
  border: none;
  border-radius: 50%;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-btn:hover {
  background: #fff;
}

/* Form Fields */
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

.field input,
.field select,
.field textarea {
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid #ccc;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s ease;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: #4a90e2;
}

.checkbox-field {
  flex-direction: row;
  align-items: center;
}

.checkbox-field input {
  margin-right: 0.5rem;
}

/* Advanced Options Button */
.toggle-advanced {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 1rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid #ccc;
  background: #f5f5f5;
  border-radius: 6px;
  cursor: pointer;
}

.toggle-advanced:hover {
  background: #ebebeb;
}

/* Upload Button */
.btn-upload {
  margin-top: 1.5rem;
  background: #4a90e2;
  color: #fff;
  padding: 0.7rem 1.4rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.btn-upload:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-upload:hover:not(:disabled) {
  background: #3c7ac5;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Progress Bar */
.progress {
  margin-top: 1rem;
  height: 8px;
  background: #eee;
  border-radius: 6px;
  overflow: hidden;
}

.progress-bar {
  height: 8px;
  background: #4a90e2;
  transition: width 0.2s ease;
}

/* Error / Success Messages */
.error {
  margin-top: 1rem;
  padding: 0.6rem;
  background: #ffe5e5;
  color: #c00;
  border-radius: 6px;
}

.success {
  margin-top: 1.5rem;
  padding: 0.6rem;
  background: #e5ffe5;
  color: #070;
  border-radius: 6px;
}

.success h3 {
  margin-top: 0;
}

.success ul {
  padding-left: 1.2rem;
}

.success a {
  color: #4a90e2;
  text-decoration: none;
}

.success a:hover {
  text-decoration: underline;
}
</style>