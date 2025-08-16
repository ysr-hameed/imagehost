<template>
  <div class="fm-wrap">
    <!-- Top bar -->
    <div class="fm-topbar">
      <div class="left">
        <h2 class="fm-title">My Images</h2>
        <div class="breadcrumbs">
          <button class="crumb" :class="{ active: currentPath.length === 0 }" @click="goRoot">Root</button>
          <template v-for="(seg, i) in currentPath" :key="i">
            <span class="crumb-sep">/</span>
            <button class="crumb" :class="{ active: i === currentPath.length - 1 }" @click="goToIndex(i)">
              {{ seg }}
            </button>
          </template>
        </div>
      </div>

      <div class="right">
        <div class="input-with-icon">
          <input
            class="fm-input"
            type="text"
            v-model.trim="q"
            placeholder="Search filename, description…"
            @keydown.enter.prevent="applySearch"
          />
          <button class="btn btn-outline small" @click="applySearch">Search</button>
        </div>

        <select class="fm-select" v-model="sortBy">
          <option value="created_at_desc">Newest</option>
          <option value="created_at_asc">Oldest</option>
          <option value="name_asc">Name A–Z</option>
          <option value="name_desc">Name Z–A</option>
          <option value="size_desc">Largest</option>
          <option value="size_asc">Smallest</option>
        </select>

        <div class="view-toggle">
          <button class="btn btn-outline small" :class="{ active: viewMode === 'grid' }" @click="viewMode='grid'">Grid</button>
          <button class="btn btn-outline small" :class="{ active: viewMode === 'list' }" @click="viewMode='list'">List</button>
        </div>

        <button class="btn btn-primary" @click="refresh" :disabled="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <!-- Content area -->
    <div class="fm-content" v-if="!loading && !error">
      <!-- Folders -->
      <div v-if="foldersInView.length" class="folder-row">
        <button
          v-for="f in foldersInView"
          :key="f.key"
          class="folder-card"
          @click="enterFolder(f.name)"
          title="Open folder"
        >
          <div class="folder-icon">📁</div>
          <div class="folder-meta">
            <div class="folder-name">{{ f.name }}</div>
            <div class="folder-count">{{ f.count }} item{{ f.count === 1 ? '' : 's' }}</div>
          </div>
        </button>
      </div>

      <!-- Files -->
      <div v-if="itemsInView.length" :class="['files', viewMode]">
        <div v-for="img in itemsInView" :key="img.id" :class="['file-card', { selected: selectedIds.has(img.id) }]">
          <label class="select-box">
            <input type="checkbox" :checked="selectedIds.has(img.id)" @change="toggleSelected(img.id)" />
          </label>

          <div class="thumb" @click="openPreview(img)">
            <img :src="img.url" :alt="img.filename" loading="lazy" />
            <span class="badge" :class="img.is_private ? 'badge-private' : 'badge-public'">
              {{ img.is_private ? 'Private' : 'Public' }}
            </span>
          </div>

          <div class="meta">
            <div class="name" :title="img.filename">{{ img.filename }}</div>
            <div class="sub">
              <span>{{ formatSize(img.size) }}</span> •
              <span>{{ formatDate(img.created_at) }}</span>
            </div>
            <div class="desc" v-if="img.description">{{ img.description }}</div>
          </div>

          <div class="row-actions">
            <button class="btn btn-outline tiny" @click="copy(img.url)">Copy URL</button>
            <button v-if="img.is_private" class="btn btn-outline tiny" @click="openToken(img)">Token URL</button>
            <button class="btn btn-danger tiny" @click="confirmDelete(img)">Delete</button>
          </div>
        </div>
      </div>

      <div v-else class="empty">
        <p>No images here. Try another folder or refresh.</p>
      </div>
    </div>

    <div v-if="error" class="error-box">
      <p>{{ error }}</p>
      <button class="btn btn-outline" @click="refresh">Retry</button>
    </div>

    <div v-if="loading" class="loading-box">
      <div class="spinner"></div>
      <div class="muted">Loading images…</div>
    </div>

    <!-- Preview Modal -->
    <div v-if="preview" class="modal">
      <div class="modal-card">
        <div class="modal-head">
          <div class="mh-left">
            <h3 class="modal-title" :title="preview.filename">{{ preview.filename }}</h3>
            <div class="mh-sub">
              <span>{{ formatSize(preview.size) }}</span> •
              <span>{{ formatDate(preview.created_at) }}</span> •
              <span class="badge" :class="preview.is_private ? 'badge-private' : 'badge-public'">
                {{ preview.is_private ? 'Private' : 'Public' }}
              </span>
            </div>
          </div>
          <div class="mh-right">
            <button class="btn btn-outline small" @click="copy(preview.url)">Copy URL</button>
            <button v-if="preview.is_private" class="btn btn-outline small" @click="openToken(preview)">Token URL</button>
            <button class="btn btn-danger small" @click="confirmDelete(preview)">Delete</button>
            <button class="btn btn-secondary small" @click="closePreview">Close</button>
          </div>
        </div>

        <div class="modal-body">
          <div class="img-wrap">
            <img :src="preview.url" :alt="preview.filename" />
          </div>
          <div class="info">
            <div class="info-row"><span>Filename</span><b>{{ preview.filename }}</b></div>
            <div class="info-row" v-if="preview.original_filename"><span>Original</span><b>{{ preview.original_filename }}</b></div>
            <div class="info-row"><span>Type</span><b>{{ preview.contentType || preview.content_type || 'image' }}</b></div>
            <div class="info-row"><span>Size</span><b>{{ formatSize(preview.size) }}</b></div>
            <div class="info-row"><span>Created</span><b>{{ formatDate(preview.created_at) }}</b></div>
            <div class="info-row" v-if="preview.description"><span>Description</span><b>{{ preview.description }}</b></div>
            <div class="info-row"><span>URL</span><b class="mono">{{ preview.url }}</b></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Token Modal -->
    <div v-if="tokenTarget" class="modal">
      <div class="modal-card small">
        <div class="modal-head">
          <h3 class="modal-title">Generate Private Token URL</h3>
          <button class="btn btn-secondary small" @click="tokenTarget = null">Close</button>
        </div>
        <div class="modal-body">
          <div class="grid-2">
            <label class="field">
              <span>Custom Expiry</span>
              <input type="number" min="1" v-model.number="tokenValue" />
            </label>
            <label class="field">
              <span>Unit</span>
              <select v-model="tokenUnit">
                <option value="seconds">Seconds</option>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
                <option value="months">Months</option>
                <option value="years">Years</option>
              </select>
            </label>
          </div>

          <p class="muted note">Max allowed by API is 7 days (604,800 seconds). Longer selections will be clamped.</p>

          <div class="row">
            <button class="btn btn-primary" @click="generateToken" :disabled="busy">Generate URL</button>
          </div>

          <div v-if="tokenUrl" class="token-result">
            <div class="copy-row">
              <input class="fm-input mono" type="text" :value="tokenUrl" readonly />
              <button class="btn btn-outline small" @click="copy(tokenUrl)">Copy</button>
            </div>
            <div class="muted">Expires in ~ {{ effectiveSeconds }} seconds.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm Delete -->
    <div v-if="toDelete" class="modal">
      <div class="modal-card small">
        <div class="modal-head">
          <h3 class="modal-title">Delete Image</h3>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to delete <b>{{ toDelete.filename }}</b>?</p>
          <div class="row gap">
            <button class="btn btn-danger" @click="doDelete" :disabled="busy">Delete</button>
            <button class="btn btn-secondary" @click="toDelete=null">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast.text" class="toast" :class="toast.kind">{{ toast.text }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { getApiKeys } from "@/api/apiKey"; // <-- your API key fetch

const apiBase = ref(import.meta.env.VITE_USER_API_BASE || 'http://localhost:4000')
const apiKey = ref('')

const loading = ref(false)
const error = ref('')
const images = ref([])
const viewMode = ref('grid')
const q = ref('')
const sortBy = ref('created_at_desc')
const currentPath = ref([])
const selectedIds = ref(new Set())
const preview = ref(null)
const toDelete = ref(null)
const busy = ref(false)
const tokenTarget = ref(null)
const tokenValue = ref(1)
const tokenUnit = ref('days')
const tokenUrl = ref('')
const effectiveSeconds = ref(0)
const toast = ref({ text: '', kind: '' })
let toastTimer = null

// Axios instance with internal header
const client = computed(() =>
  axios.create({
    baseURL: apiBase.value,
    headers: {
      'x-api-key': apiKey.value,
      'x-internal': '1'
    }
  })
)

function showToast(text, kind='success', ms=2000) {
  toast.value = { text, kind }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.value = { text:'', kind:'' }, ms)
}

// Format helpers
function formatSize(bytes) {
  if (bytes === undefined || bytes === null) return ''
  const units = ['B','KB','MB','GB','TB']
  let i = 0, n = bytes
  while(n >= 1024 && i < units.length - 1){ n /= 1024; i++ }
  return n.toFixed(2) + ' ' + units[i]
}

function formatDate(s) {
  try { return new Date(s).toLocaleString() }
  catch { return s }
}

// Token helpers
function clampTokenSeconds(sec){ const max=604800; if(sec<=0) return 3600; return Math.min(sec,max) }
function toSeconds(val,unit){ 
  const v = Number(val||0); 
  switch(unit){
    case 'minutes': return v*60
    case 'hours': return v*3600
    case 'days': return v*86400
    case 'months': return v*2592000
    case 'years': return v*31536000
    default: return v
  }
}

const foldersInView = computed(() => images.value.filter(i => i.type === 'folder'))
const itemsInView = computed(() => images.value.filter(i => i.type !== 'folder'))

// --- FETCH IMAGES WITH DEBUG ---
async function fetchImages() {
  if(!apiKey.value) return
  loading.value = true
  error.value = ''
  selectedIds.value.clear()
  try {
    console.log('Fetching images from:', currentPath.value.join('/'))
    const res = await client.value.get('/images', { 
      params: { 
        path: currentPath.value.join('/'), 
        q: q.value, 
        sort: sortBy.value 
      } 
    })
    console.log('API response:', res.data)

    if (!Array.isArray(res.data.images)) throw new Error('API did not return array')
    images.value = res.data.images
  } catch (e) {
    console.error('Fetch images failed:', e)
    error.value = 'Failed to fetch images. Check console for details.'
  } finally {
    loading.value = false
  }
}

// --- FETCH API KEY FIRST ---
const fetchApiKey = async () => {
  loading.value = true
  try {
    const { data } = await getApiKeys()
    if (Array.isArray(data) && data.length > 0) {
      const activeKey = data.find((k) => k.active) || data[0]
      apiKey.value = activeKey.apiKey || activeKey.key || ''
    } else if (data?.apiKey || data?.key) {
      apiKey.value = data.apiKey || data.key
    } else {
      error.value = "No API keys found from server."
    }
  } catch (err) {
    console.error('API key fetch error:', err)
    error.value = err.response?.data?.message || "Failed to fetch API key."
  } finally {
    loading.value = false
    if(apiKey.value) fetchImages() // fetch images after key is ready
  }
}

// Search & refresh
function applySearch(){ fetchImages() }
function refresh(){ fetchImages() }

// Folder navigation
function enterFolder(name){ currentPath.value.push(name); fetchImages() }
function goRoot(){ currentPath.value = []; fetchImages() }
function goToIndex(i){ currentPath.value = currentPath.value.slice(0,i+1); fetchImages() }

// Selection
function toggleSelected(id){ 
  if(selectedIds.value.has(id)) selectedIds.value.delete(id)
  else selectedIds.value.add(id)
}

// Preview modal
function openPreview(img){ preview.value = img }
function closePreview(){ preview.value = null }

// Delete
function confirmDelete(img){ toDelete.value = img }
async function doDelete(){
  if(!toDelete.value) return
  busy.value = true
  try {
    console.log('Deleting image id:', toDelete.value.id)
    await client.value.delete('/images/' + toDelete.value.id)
    showToast('Deleted successfully')
    fetchImages()
    toDelete.value = null
  } catch(e) {
    console.error('Delete failed:', e)
    showToast('Delete failed','error')
  } finally {
    busy.value = false
  }
}

// Copy
function copy(txt){ navigator.clipboard.writeText(txt); showToast('Copied!') }

// Token
function openToken(img){ 
  tokenTarget.value = img
  tokenUrl.value = ''
  tokenValue.value = 1
  tokenUnit.value = 'days'
  effectiveSeconds.value = 0
}

async function generateToken(){
  if(!tokenTarget.value) return
  busy.value = true
  try {
    const secs = clampTokenSeconds(toSeconds(tokenValue.value, tokenUnit.value))
    console.log('Generating token for:', tokenTarget.value.id, 'seconds:', secs)
    const res = await client.value.post('/images/' + tokenTarget.value.id + '/token', { seconds: secs })
    console.log('Token response:', res.data)
    tokenUrl.value = res.data.url
    effectiveSeconds.value = secs
  } catch(e) {
    console.error('Token generation failed:', e)
    showToast('Token generation failed','error')
  } finally {
    busy.value = false
  }
}

// --- INIT ---
onMounted(fetchApiKey) // fetch key first
</script>

<style scoped>
:root {
  --primary:#4f46e5; --secondary:#f3f4f6; --bg:#fff; --text:#111827; --muted:#6b7280;
  --danger:#dc2626; --success:#16a34a; --border:#e5e7eb; --radius:.5rem; --shadow:0 4px 12px rgba(0,0,0,0.05);
}

.fm-wrap{ display:flex; flex-direction:column; padding:1rem; background:var(--bg); color:var(--text); min-height:100vh; box-sizing:border-box }
.fm-topbar{ display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap }
.fm-title{ font-size:1.5rem; font-weight:600 }
.breadcrumbs{ display:flex; align-items:center; gap:.25rem; flex-wrap:wrap }
.crumb{ background:var(--secondary); border-radius:var(--radius); padding:.25rem .5rem; font-size:.875rem; cursor:pointer; transition:background .2s }
.crumb.active{ background:var(--primary); color:#fff }
.crumb-sep{ font-weight:600 }
.fm-input{ border:1px solid var(--border); border-radius:var(--radius); padding:.5rem; flex:1; min-width:150px }
.fm-select{ border:1px solid var(--border); border-radius:var(--radius); padding:.4rem; margin-left:.5rem }
.input-with-icon{ display:flex; align-items:center; gap:.5rem }
.btn{ border:none; border-radius:var(--radius); padding:.4rem .75rem; cursor:pointer; font-size:.875rem; transition:all .2s }
.btn-outline{ background:transparent; border:1px solid var(--border) }
.btn-primary{ background:var(--primary); color:#fff }
.btn-danger{ background:var(--danger); color:#fff }
.btn-secondary{ background:var(--secondary); color:var(--text) }
.btn.tiny, .btn.small{ padding:.25rem .5rem; font-size:.75rem }
.files.grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:1rem }
.files.list{ display:flex; flex-direction:column; gap:.75rem }
.folder-row{ display:flex; flex-wrap:wrap; gap:1rem }
.folder-card, .file-card{ background:var(--secondary); border-radius:var(--radius); box-shadow:var(--shadow); padding:.5rem; display:flex; flex-direction:column; cursor:pointer; transition:transform .2s,box-shadow .2s }
.folder-card:hover, .file-card:hover{ transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,0.1) }
.folder-icon{ font-size:2rem; text-align:center; margin-bottom:.25rem }
.folder-meta, .meta{text-align:center}
.folder-name, .name{ font-weight:600; font-size:.9rem; margin-bottom:.25rem }
.folder-count, .sub{ font-size:.75rem; color:var(--muted) }
.thumb{ position:relative; margin-bottom:.5rem; border-radius:var(--radius); overflow:hidden }
.thumb img{ width:100%; height:auto; display:block }
.badge{ position:absolute; top:.25rem; right:.25rem; padding:.15rem .3rem; font-size:.7rem; border-radius:var(--radius); color:#fff }
.badge-private{ background:var(--danger) }
.badge-public{ background:var(--success) }
.modal{ position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(17,24,39,.6); display:flex; align-items:center; justify-content: center; z-index:999; }
.modal-card{ background:var(--bg); border-radius:var(--radius); max-width:600px; width:90%; max-height:90%; overflow-y:auto; padding:1rem; box-shadow:var(--shadow) }
.modal-head{ display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem }
.modal-title{ font-weight:600; font-size:1.2rem }
.modal-body{ display:flex; flex-direction:column; gap:.5rem }
.img-wrap img{ width:100%; border-radius:var(--radius); object-fit:contain }
.info{ display:flex; flex-direction:column; gap:.25rem }
.info-row{ display:flex; justify-content:space-between; font-size:.85rem }
.mono{ font-family:monospace }
.toast{ position:fixed; bottom:1rem; right:1rem; background:var(--primary); color:#fff; padding:.5rem 1rem; border-radius:var(--radius); box-shadow:var(--shadow); z-index:1000; transition:opacity .3s }
.toast.success{ background:var(--success) }
.toast.error{ background:var(--danger) }

/* Responsive */
@media (max-width:768px){
  .fm-topbar{ flex-direction:column; align-items:flex-start; gap:.5rem }
  .files.grid{ grid-template-columns:repeat(auto-fill,minmax(120px,1fr)) }
  .modal-card{ width:95%; padding:.75rem }
}

@media (max-width:480px){
  .files.grid{ grid-template-columns:repeat(auto-fill,minmax(100px,1fr)) }
  .btn{ font-size:.75rem; padding:.25rem .5rem }
  .fm-input{ min-width:100px }
  .fm-select{ margin-left:0 }
}
</style>