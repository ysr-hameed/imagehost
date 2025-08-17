<template>
  <div class="fm-wrap">
    <!-- Top Bar -->
    <div class="fm-topbar">
      <h1 class="fm-title">My Images</h1>
      <div class="controls">
        <input v-model="q" @keyup.enter="applySearch" placeholder="Search..." class="fm-input"/>
        <select v-model="sortBy" @change="refresh" class="fm-select">
          <option value="created_at_desc">Newest</option>
          <option value="created_at_asc">Oldest</option>
          <option value="size_desc">Largest</option>
          <option value="size_asc">Smallest</option>
        </select>
        <select v-model="filterPrivate" @change="refresh" class="fm-select">
          <option value="">All</option>
          <option value="true">Private</option>
          <option value="false">Public</option>
        </select>
        <button @click="refresh" class="fm-button">Refresh</button>
      </div>
    </div>

    <!-- Loader / Error -->
    <div v-if="loading" class="fm-message">Loading...</div>
    <div v-if="error" class="fm-error">{{ error }}</div>

    <!-- Images Grid -->
    <div v-if="images.length" class="fm-grid">
      <div v-for="img in images" :key="img.id" class="fm-item">
        <img :src="img.url" @click="openPreview(img)" class="fm-img"/>
        <div class="info">
          <div class="filename">{{ img.filename }}</div>
          <div class="size">{{ formatSize(img.size) }}</div>
          <div class="actions">
            <button @click="toggleSelected(img.id)" class="icon-btn">
              <CheckCircle v-if="selectedIds.has(img.id)" class="icon"/>
              <Circle v-else class="icon"/>
            </button>
            <button @click="confirmDelete(img)" class="icon-btn delete">
              <XCircle class="icon"/>
            </button>
            <button @click="openToken(img)" class="icon-btn token">
              <Key class="icon"/>
            </button>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="!loading" class="fm-message">No images found.</div>

    <!-- Pagination -->
    <div v-if="totalPages>1" class="fm-pagination">
      <button @click="prevPage" :disabled="page<=1" class="fm-button-small">Prev</button>
      <span>Page {{ page }} / {{ totalPages }}</span>
      <button @click="nextPage" :disabled="page>=totalPages" class="fm-button-small">Next</button>
    </div>

    <!-- Preview Modal -->
    <div v-if="preview" class="fm-modal" @click.self="closePreview">
      <div class="fm-modal-content">
        <img :src="preview.url" class="fm-modal-img"/>
        <button @click="closePreview" class="fm-modal-close">✕</button>
      </div>
    </div>

    <!-- Token Modal -->
    <div v-if="tokenTarget" class="fm-modal" @click.self="tokenTarget=null">
      <div class="fm-modal-content small">
        <h2>Generate Token for {{ tokenTarget.filename }}</h2>
        <div class="token-controls">
          <input type="number" v-model.number="tokenValue"/>
          <select v-model="tokenUnit">
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
            <option value="months">Months</option>
            <option value="years">Years</option>
          </select>
        </div>
        <button @click="generateToken" :disabled="busy" class="fm-button">Generate</button>
        <div v-if="tokenUrl" class="fm-token-url">
          <a :href="tokenUrl" target="_blank">{{ tokenUrl }}</a>
        </div>
        <button @click="tokenTarget=null" class="fm-modal-close">✕</button>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast.text" :class="['fm-toast', toast.kind==='success'?'success':'error']">{{ toast.text }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { getApiKeys } from "@/api/apiKey"
import { CheckCircle, Circle, XCircle, Key } from 'lucide-vue-next'

// State
const apiKey = ref('')
const loading = ref(false)
const error = ref('')
const images = ref([])
const q = ref('')
const sortBy = ref('created_at_desc')
const filterPrivate = ref('')
const page = ref(1)
const limit = ref(20)
const totalPages = ref(1)
const selectedIds = ref(new Set())
const preview = ref(null)
const busy = ref(false)
const tokenTarget = ref(null)
const tokenValue = ref(1)
const tokenUnit = ref('days')
const tokenUrl = ref('')
const toast = ref({ text:'', kind:'' })
let toastTimer = null
const apiBase = ref(import.meta.env.VITE_USER_API_BASE || 'http://localhost:4000')

// Axios client
const client = computed(() => axios.create({
  baseURL: apiBase.value,
  headers: { 'x-api-key': apiKey.value }
}))

// Toast helper
function showToast(text, kind='success', ms=2500){
  toast.value={text,kind}
  clearTimeout(toastTimer)
  toastTimer=setTimeout(()=>toast.value={text:'',kind:''}, ms)
}

// Format bytes
function formatSize(bytes){
  if(!bytes) return ''
  const units=['B','KB','MB','GB','TB']
  let i=0,n=bytes
  while(n>=1024 && i<units.length-1){n/=1024;i++}
  return n.toFixed(2)+' '+units[i]
}

// Token helper
function clampTokenSeconds(sec){ const max=604800; return sec<=0?3600:Math.min(sec,max) }
function toSeconds(val,unit){
  const v=Number(val||0)
  switch(unit){
    case 'minutes': return v*60
    case 'hours': return v*3600
    case 'days': return v*86400
    case 'months': return v*2592000
    case 'years': return v*31536000
    default: return v
  }
}

// Fetch API Key
const fetchApiKey = async()=>{
  loading.value=true
  try{
    const { data } = await getApiKeys()
    if(Array.isArray(data) && data.length>0){ 
      const active=data.find(k=>k.active)||data[0]
      apiKey.value=active.apiKey||active.key||''
    } else if(data?.apiKey||data?.key) apiKey.value=data.apiKey||data.key
    else error.value="No API keys found"
  } catch(e){ error.value="Failed to fetch API key" }
  finally{ loading.value=false; if(apiKey.value) fetchImages() }
}

// Fetch images
const fetchImages = async()=>{
  if(!apiKey.value) return
  loading.value=true; error.value=''
  try{
    const res = await client.value.get('/images',{
      params: {
        page: page.value,
        limit,
        q: q.value || undefined,
        sort: sortBy.value,
        is_private: filterPrivate.value || undefined
      }
    })
    images.value = res.data.images || []
    totalPages.value = res.data.pagination?.totalPages || 1
  } catch(e){
    error.value='Failed to fetch images'; console.error(e)
  } finally{ loading.value=false }
}

// Pagination
function applySearch(){ page.value=1; fetchImages() }
function refresh(){ fetchImages() }
function prevPage(){ if(page.value>1){ page.value--; fetchImages() } }
function nextPage(){ if(page.value<totalPages.value){ page.value++; fetchImages() } }

// Selection / preview
function toggleSelected(id){ selectedIds.value.has(id)?selectedIds.value.delete(id):selectedIds.value.add(id) }
function openPreview(img){ preview.value=img }
function closePreview(){ preview.value=null }

// Delete
function confirmDelete(img){ if(confirm(`Delete ${img.filename}?`)) doDelete(img.id) }
async function doDelete(id){
  busy.value=true
  try{ await client.value.delete('/images/'+id); showToast('Deleted successfully'); fetchImages() }
  catch(e){ showToast('Delete failed','error'); console.error(e) }
  finally{ busy.value=false }
}

// Token
function openToken(img){ tokenTarget.value=img; tokenUrl.value=''; tokenValue.value=1; tokenUnit.value='days' }
async function generateToken(){
  if(!tokenTarget.value) return
  busy.value=true
  try{
    const days = Math.ceil(clampTokenSeconds(toSeconds(tokenValue.value, tokenUnit.value))/86400)
    const res = await client.value.get(`/images/${tokenTarget.value.id}/token`, { params: { expire_days: days } })
    tokenUrl.value=res.data.url||''
  } catch(e){ showToast('Token generation failed','error'); console.error(e) }
  finally{ busy.value=false }
}

onMounted(fetchApiKey)
</script>

<style scoped>
/* ... same CSS as before ... */
/* Container */
.fm-wrap {
  padding: 16px;
  font-family: Arial, sans-serif;
  background: #f9f9f9;
  min-height: 100vh;
  box-sizing: border-box;
}

/* Top Bar */
.fm-topbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.fm-title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 8px;
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.fm-input, .fm-select {
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
}

.fm-button, .fm-button-small {
  padding: 6px 12px;
  border: none;
  background-color: #007BFF;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.fm-button:hover, .fm-button-small:hover {
  background-color: #0056b3;
}

.fm-button-small {
  padding: 4px 8px;
  font-size: 12px;
}

/* Loader / Error */
.fm-message {
  text-align: center;
  margin: 20px 0;
  color: #555;
}

.fm-error {
  text-align: center;
  margin: 20px 0;
  color: red;
  font-weight: bold;
}

/* Grid */
.fm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.fm-item {
  background: white;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}

.fm-img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  cursor: pointer;
  transition: transform 0.2s;
}

.fm-img:hover {
  transform: scale(1.05);
}

.info {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filename {
  font-weight: bold;
  font-size: 14px;
  word-break: break-word;
}

.size {
  font-size: 12px;
  color: #666;
}

.actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s;
}

.icon-btn:hover {
  background: rgba(0,0,0,0.05);
}

.icon-btn.delete:hover {
  background: rgba(255,0,0,0.1);
}

.icon-btn.token:hover {
  background: rgba(0,123,255,0.1);
}

.icon {
  width: 18px;
  height: 18px;
  stroke: #333;
}

/* Pagination */
.fm-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  flex-wrap: wrap;
}

/* Modal */
.fm-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.fm-modal-content {
  background: white;
  border-radius: 8px;
  padding: 16px;
  max-width: 90%;
  max-height: 90%;
  overflow: auto;
  position: relative;
}

.fm-modal-content.small {
  max-width: 400px;
}

.fm-modal-img {
  max-width: 100%;
  max-height: 80vh;
  display: block;
  margin: 0 auto;
  border-radius: 6px;
}

.fm-modal-close {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #333;
}

/* Token Modal */
.token-controls {
  display: flex;
  gap: 6px;
  margin: 8px 0 12px;
}

.token-controls input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.token-controls select {
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid #ccc;
}

.fm-token-url {
  word-break: break-all;
  font-size: 12px;
  margin-top: 8px;
}

/* Toast */
.fm-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 16px;
  border-radius: 6px;
  color: white;
  z-index: 2000;
  font-size: 14px;
  opacity: 0.95;
}

.fm-toast.success {
  background-color: #28a745;
}

.fm-toast.error {
  background-color: #dc3545;
}

/* Responsive adjustments */
@media(max-width: 768px){
  .fm-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
  .fm-title { font-size: 20px; }
  .fm-input, .fm-select, .fm-button { font-size: 13px; }
  .icon { width: 16px; height: 16px; }
}

@media(max-width: 480px){
  .fm-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
  .controls { flex-direction: column; gap: 6px; }
}
</style>