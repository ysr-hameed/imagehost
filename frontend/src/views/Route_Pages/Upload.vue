<template>
  <div class="upload-page">
    <h1>Upload File</h1>

    <form @submit.prevent="onSubmit" class="upload-form" novalidate>
      <label class="field">
        <span>File</span>
        <div
          class="file-dropzone"
          :class="{ dragging: dragging }"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
          @click="fileInput.click()"
          tabindex="0"
          @keydown.enter.prevent="fileInput.click()"
          role="button"
          aria-label="File upload dropzone"
        >
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            multiple
            @change="onFileChange"
            hidden
          />
          <div v-if="files.length === 0" class="placeholder">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              fill="none"
              stroke="var(--text-muted)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="icon-upload"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p>Click or drag image(s) here to upload</p>
          </div>

          <ul v-else class="file-list" aria-live="polite">
            <li v-for="(file, idx) in files" :key="file.uniqueKey" class="file-item">
              <img v-if="file.preview" :src="file.preview" alt="File preview" class="thumb" />
              <div class="file-info">
                <strong>{{ file.name }}</strong>
                <small>{{ formatSize(file.size || 0) }}</small>
              </div>
              <button
                type="button"
                @click="removeFile(idx)"
                title="Remove file"
                aria-label="Remove file"
                class="remove-btn"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="var(--danger)"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="icon-cross"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </li>
          </ul>
        </div>
      </label>

      <label class="field">
        <span>Filename (optional override)</span>
        <input
          type="text"
          v-model.trim="form.filename"
          placeholder="Leave empty to use original filename"
          autocomplete="off"
          aria-describedby="filenameHelp"
        />
        <small id="filenameHelp" class="field-help">
          If multiple files, this will be applied to the first file only.
        </small>
      </label>

      <button
        type="button"
        class="btn btn-secondary toggle-advanced-btn"
        @click="showAdvanced = !showAdvanced"
        :aria-pressed="showAdvanced"
        :aria-expanded="showAdvanced"
        aria-controls="advancedFields"
      >
        {{ showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options' }}
      </button>

      <transition name="fade">
        <div v-if="showAdvanced" class="advanced-fields" id="advancedFields">
          <label class="field">
            <span>Path (optional)</span>
            <input
              type="text"
              v-model.trim="form.path"
              placeholder="e.g. myfolder/subfolder"
              autocomplete="off"
            />
          </label>

          <label class="field">
            <span>Description (optional)</span>
            <textarea v-model.trim="form.description" placeholder="Enter description" rows="3"></textarea>
          </label>

          <label class="field">
            <span>Tags (optional, comma separated)</span>
            <input
              type="text"
              v-model.trim="form.tags"
              placeholder="tag1, tag2, tag3"
              autocomplete="off"
            />
          </label>

          <label class="field checkbox-field">
            <input type="checkbox" v-model="form.private" id="privateCheckbox" />
            <label for="privateCheckbox">Make file private</label>
          </label>

          <label class="field" v-if="form.private">
            <span>Expire token seconds (optional)</span>
            <input
              type="number"
              v-model.number="form.expire_token_seconds"
              min="60"
              max="604800"
              placeholder="Defaults to 86400 (1 day)"
            />
          </label>

          <label class="field">
            <span>Expire delete seconds (optional)</span>
            <input
              type="number"
              v-model.number="form.expire_delete"
              min="0"
              max="604800"
              placeholder="Set to 0 for no auto-delete"
            />
          </label>
        </div>
      </transition>

      <button
        type="submit"
        class="btn btn-primary"
        :disabled="uploading || files.length === 0 || loadingApiKey"
        aria-busy="uploading"
      >
        <span v-if="uploading" class="spinner" aria-label="Uploading..."></span>
        {{ uploading ? 'Uploading...' : loadingApiKey ? 'Loading API Key...' : 'Upload' }}
      </button>

      <div class="progress-bar-container" v-if="uploading || progress > 0">
        <div
          class="progress-bar"
          :style="{ width: progress + '%' }"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="progress"
          role="progressbar"
        ></div>
      </div>

      <div v-if="error" class="error-message" role="alert" tabindex="-1" ref="errorRef">
        {{ error }}
      </div>

      <div v-if="success" class="success-message" role="status">
        <p>Uploaded {{ success.uploaded || 0 }} file(s) successfully!</p>
        <ul>
          <li v-for="file in success.files || []" :key="file.id || file.filename">
            <a :href="file.url || '#'" target="_blank" rel="noopener">
              {{ file.filename || 'Unnamed file' }}
            </a>
            <small>({{ file.size ? formatSize(file.size) : 'unknown size' }})</small>
            <span v-if="file.private" class="tag-private">Private</span>
          </li>
        </ul>
      </div>
    </form>
  </div>
</template>

<script>
import { ref, reactive, onBeforeUnmount } from "vue";
import { getApiKeys } from "@/api/apiKey"; // Your API module to fetch keys

export default {
  name: "FileUploadPage",
  setup() {
    const files = ref([]);
    const form = reactive({
      path: "",
      filename: "",
      description: "",
      tags: "",
      private: false,
      expire_token_seconds: 86400,
      expire_delete: 0,
    });

    const uploading = ref(false);
    const progress = ref(0);
    const error = ref("");
    const success = ref(null);
    const dragging = ref(false);
    const apiKey = ref("");
    const loadingApiKey = ref(true);
    const showAdvanced = ref(false);
    const errorRef = ref(null);

    // Fetch API keys on mount, pick first active one
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
      } finally {
        loadingApiKey.value = false;
      }
    };

    fetchApiKey();

    // Add unique keys for v-for
    const addFiles = (newFiles) => {
      for (const file of newFiles) {
        if (!file.type.startsWith("image/")) continue;
        file.preview = URL.createObjectURL(file);
        file.uniqueKey = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
        files.value.push(file);
      }
    };

    const removeFile = (idx) => {
      if (files.value[idx].preview) {
        URL.revokeObjectURL(files.value[idx].preview);
      }
      files.value.splice(idx, 1);
    };

    const formatSize = (bytes) => {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1024 / 1024).toFixed(2) + " MB";
    };

    const onFileChange = (e) => {
      const selectedFiles = e.target.files;
      addFiles(selectedFiles);
      e.target.value = ""; // reset input so same file can be selected again if needed
    };

    const onDrop = (e) => {
      dragging.value = false;
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
        e.dataTransfer.clearData();
      }
    };

    const onSubmit = async () => {
      error.value = "";
      success.value = null;

      if (!files.value.length) {
        error.value = "Please select at least one image file.";
        focusError();
        return;
      }
      if (!apiKey.value) {
        error.value = "API key not found. Please login or try again.";
        focusError();
        return;
      }

      uploading.value = true;
      progress.value = 0;

      try {
        const formData = new FormData();

        if (form.path.trim()) formData.append("path", form.path.trim());
        if (form.filename.trim()) formData.append("filename", form.filename.trim());
        if (form.description.trim()) formData.append("description", form.description.trim());
        if (form.tags.trim()) formData.append("tags", form.tags.trim());
        if (form.private) formData.append("private", "true");
        if (form.private && form.expire_token_seconds)
          formData.append("expire_token_seconds", String(form.expire_token_seconds));
        if (form.expire_delete) formData.append("expire_delete", String(form.expire_delete));

        for (const file of files.value) {
          formData.append("file", file, file.name);
        }

        const UPLOAD_API_URL = import.meta.env.VITE_UPLOAD_API_URL || "/upload";

        console.log("Uploading to:", UPLOAD_API_URL);
        console.log("Using API Key:", apiKey.value);

        // Actual fetch with upload progress using XMLHttpRequest for progress events
        const xhr = new XMLHttpRequest();
        xhr.open("POST", UPLOAD_API_URL, true);
        xhr.setRequestHeader("x-api-key", apiKey.value);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            progress.value = Math.round((event.loaded / event.total) * 100);
          }
        };

        const promise = new Promise((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch {
                resolve(null);
              }
            } else {
              reject(xhr);
            }
          };
          xhr.onerror = () => reject(xhr);
          xhr.send(formData);
        });

        const data = await promise;

        progress.value = 100;

        if (!data) {
          error.value = `Upload failed with status ${xhr.status}`;
          focusError();
          return;
        }

        success.value = data;

        files.value.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
        files.value = [];
        Object.assign(form, {
          path: "",
          filename: "",
          description: "",
          tags: "",
          private: false,
          expire_token_seconds: 86400,
          expire_delete: 0,
        });
      } catch (err) {
        error.value = "Unexpected error: " + (err.message || err.statusText || err.status);
        focusError();
        console.error("Upload error:", err);
      } finally {
        uploading.value = false;
        progress.value = 0;
      }
    };

    const focusError = () => {
      // Focus error message for screen readers
      setTimeout(() => {
        if (errorRef.value) errorRef.value.focus();
      }, 100);
    };

    onBeforeUnmount(() => {
      files.value.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    });

    return {
      files,
      form,
      uploading,
      progress,
      error,
      success,
      dragging,
      apiKey,
      loadingApiKey,
      showAdvanced,
      addFiles,
      removeFile,
      formatSize,
      onFileChange,
      onDrop,
      onSubmit,
      errorRef,
    };
  },
};
</script>

<style scoped>
:root {
  --primary: #3b82f6;
  --danger: #ef4444;
  --success: #22c55e;
  --bg: #ffffff;
  --bg-secondary: #f9fafb;
  --bg-hover: #e0f2fe;
  --text: #1f2937;
  --text-muted: #6b7280;
  --text-secondary: #4b5563;
  --text-inverse: #ffffff;
  --btn-bg: var(--primary);
  --btn-hover: #2563eb;
  --btn-text: var(--text-inverse);
  --radius: 8px;
  --font-main: "Inter", sans-serif;
}

.upload-page {
  max-width: 720px;
  margin: 2rem auto;
  font-family: var(--font-main);
  color: var(--text);
  background: var(--bg);
  padding: 2rem;
  border-radius: var(--radius);
  box-shadow: 0 3px 15px rgb(0 0 0 / 0.1);
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
}

@media (min-width: 768px) {
  .upload-page {
    grid-template-columns: 1fr 1fr;
  }
}

.upload-form {
  display: contents;
}

.field {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.8rem;
  grid-column: span 2;
}

@media (min-width: 768px) {
  .field.half {
    grid-column: span 1;
  }
}

.field > span {
  font-weight: 600;
  margin-bottom: 0.4rem;
  color: var(--text-secondary);
  user-select: none;
}

.field-help {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: -0.4rem;
  margin-bottom: 0.4rem;
}

input[type="text"],
input[type="number"],
input[type="file"],
textarea {
  font-size: 1rem;
  padding: 0.6rem 0.8rem;
  border: 1.5px solid var(--border, #d1d5db);
  border-radius: var(--radius);
  transition: border-color 0.2s ease-in-out;
  color: var(--text);
  background: var(--bg);
  resize: vertical;
}

input[type="text"]:focus,
input[type="number"]:focus,
textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 6px var(--primary);
}

.checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: var(--text);
  margin-top: 1rem;
}

.checkbox-field input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.file-dropzone {
  grid-column: span 2;
  border: 2px dashed var(--border, #d1d5db);
  border-radius: var(--radius);
  min-height: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 1rem;
  user-select: none;
  transition: border-color 0.3s ease;
  text-align: center;
}

.file-dropzone.dragging {
  border-color: var(--primary);
  background-color: var(--bg-hover);
}

.placeholder {
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  user-select: none;
}

.icon-upload {
  stroke: var(--text-muted);
  width: 48px;
  height: 48px;
}

.file-list {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  max-height: 160px;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-start;
}

.file-item {
  background: var(--bg-secondary);
  border-radius: var(--radius);
  padding: 0.4rem 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 220px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.1);
  user-select: none;
}

.thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: var(--radius);
  flex-shrink: 0;
  border: 1px solid var(--border, #d1d5db);
}

.file-info {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.file-info strong {
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}

.file-info small {
  font-size: 0.75rem;
  color: var(--text-muted);
  user-select: none;
}

.remove-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.1rem;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.remove-btn:hover,
.remove-btn:focus {
  background-color: var(--danger);
  outline: none;
}

.remove-btn svg {
  stroke: var(--danger);
  width: 20px;
  height: 20px;
}

.btn {
  font-weight: 700;
  cursor: pointer;
  border: none;
  border-radius: var(--radius);
  padding: 0.7rem 1.2rem;
  font-size: 1rem;
  user-select: none;
  transition: background-color 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-primary {
  background-color: var(--btn-bg);
  color: var(--btn-text);
}

.btn-primary:disabled {
  background-color: #a5b4fc;
  cursor: not-allowed;
}

.btn-primary:not(:disabled):hover,
.btn-primary:not(:disabled):focus {
  background-color: var(--btn-hover);
  outline: none;
}

.btn-secondary {
  background-color: var(--bg-secondary);
  color: var(--text-secondary);
  border: 1.5px solid var(--border, #d1d5db);
}

.btn-secondary:hover,
.btn-secondary:focus {
  background-color: var(--bg-hover);
  outline: none;
}

.toggle-advanced-btn {
  margin: 1rem 0;
  width: 100%;
  max-width: 300px;
  justify-content: center;
}

.progress-bar-container {
  width: 100%;
  height: 6px;
  background-color: var(--bg-secondary);
  border-radius: var(--radius);
  overflow: hidden;
  margin-top: 1rem;
}

.progress-bar {
  height: 100%;
  background-color: var(--primary);
  transition: width 0.3s ease;
}

.error-message {
  background-color: #fee2e2;
  border: 1px solid var(--danger);
  color: var(--danger);
  border-radius: var(--radius);
  padding: 0.75rem 1rem;
  margin-top: 1rem;
  font-weight: 600;
}

.success-message {
  background-color: #dcfce7;
  border: 1px solid var(--success);
  color: var(--success);
  border-radius: var(--radius);
  padding: 0.75rem 1rem;
  margin-top: 1rem;
}

.success-message p {
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.success-message ul {
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.success-message li {
  margin-bottom: 0.3rem;
}

.success-message a {
  color: var(--primary);
  text-decoration: underline;
}

.tag-private {
  background-color: var(--danger);
  color: var(--btn-text);
  font-size: 0.7rem;
  padding: 0 0.4rem;
  margin-left: 0.6rem;
  border-radius: 4px;
  user-select: none;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.spinner {
  border: 3px solid #cbd5e1;
  border-top: 3px solid var(--btn-text);
  border-radius: 50%;
  width: 1.2em;
  height: 1.2em;
  margin-right: 0.6em;
  animation: spin 1s linear infinite;
  display: inline-block;
  vertical-align: middle;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>