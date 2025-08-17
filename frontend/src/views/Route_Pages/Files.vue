<template>
  <div class="fm-wrap">
    <!-- Top Bar -->
    <div class="fm-topbar">
      <h1 class="fm-title">My Images</h1>
      <div class="controls">
        <input v-model="q" @keyup.enter="applySearch" placeholder="Search by filename..." class="fm-input" />
        <select v-model="sortBy" @change="refresh" class="fm-select">
          <option value="created_at_desc">Newest</option>
          <option value="created_at_asc">Oldest</option>
          <option value="size_desc">Largest</option>
          <option value="size_asc">Smallest</option>
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
              <svg v-if="selectedIds.has(img.id)" xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button @click="confirmDelete(img)" class="icon-btn delete">
              <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
            <button @click="openToken(img)" class="icon-btn token">
              <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
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
    <div v-if="preview" class="fm-modal">
      <div class="fm-modal-content">
        <img :src="preview.url" class="fm-modal-img"/>
        <button @click="closePreview" class="fm-modal-close">✕</button>
      </div>
    </div>

    <!-- Token Modal -->
    <div v-if="tokenTarget" class="fm-modal">
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

const apiKey = ref('')
const loading = ref(false)
const error = ref('')
const images = ref([])
const q = ref('')
const sortBy = ref('created_at_desc')
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

// Helpers
function showToast(text, kind='success', ms=2500){
  toast.value={text,kind}
  clearTimeout(toastTimer)
  toastTimer=setTimeout(()=>toast.value={text:'',kind:''}, ms)
}
function formatSize(bytes){
  if(!bytes) return ''
  const units=['B','KB','MB','GB','TB']
  let i=0,n=bytes
  while(n>=1024 && i<units.length-1){n/=1024;i++}
  return n.toFixed(2)+' '+units[i]
}
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

const client=computed(()=>axios.create({ baseURL: apiBase.value, headers:{'x-api-key':apiKey.value,'x-internal':'1'} }))

const fetchApiKey=async()=>{
  loading.value=true
  try{
    const { data } = await getApiKeys()
    if(Array.isArray(data) && data.length>0){ const active=data.find(k=>k.active)||data[0]; apiKey.value=active.apiKey||active.key||'' }
    else if(data?.apiKey||data?.key) apiKey.value=data.apiKey||data.key
    else error.value="No API keys found"
  } catch(e){ error.value="Failed to fetch API key" }
  finally{ loading.value=false; if(apiKey.value) fetchImages() }
}

const fetchImages=async()=>{
  if(!apiKey.value) return
  loading.value=true; error.value=''
  try{
    const res=await client.value.get('/images',{params:{page:page.value, limit:Number(limit.value), q:q.value, sort:sortBy.value}})
    images.value=res.data.images||[]
    totalPages.value=res.data.pagination?.totalPages||1
  }catch(e){ error.value='Failed to fetch images'; console.error(e) }
  finally{ loading.value=false }
}

function applySearch(){ page.value=1; fetchImages() }
function refresh(){ fetchImages() }
function prevPage(){ if(page.value>1){ page.value--; fetchImages() } }
function nextPage(){ if(page.value<totalPages.value){ page.value++; fetchImages() } }
function toggleSelected(id){ selectedIds.value.has(id)?selectedIds.value.delete(id):selectedIds.value.add(id) }
function openPreview(img){ preview.value=img }
function closePreview(){ preview.value=null }
function confirmDelete(img){ if(confirm(`Delete ${img.filename}?`)) doDelete(img.id) }
async function doDelete(id){
  busy.value=true
  try{ await client.value.delete('/images/'+id); showToast('Deleted successfully'); fetchImages() }
  catch(e){ showToast('Delete failed','error'); console.error(e) }
  finally{ busy.value=false }
}

function openToken(img){ tokenTarget.value=img; tokenUrl.value=''; tokenValue.value=1; tokenUnit.value='days' }
async function generateToken(){
  if(!tokenTarget.value) return
  busy.value=true
  try{
    const secs=clampTokenSeconds(toSeconds(tokenValue.value,tokenUnit.value))
    const res=await client.value.get(`/images/${tokenTarget.value.id}/token`,{ params:{expire_seconds:secs} })
    tokenUrl.value=res.data.url||''
  }catch(e){ showToast('Token generation failed','error'); console.error(e) }
  finally{ busy.value=false }
}

onMounted(fetchApiKey)
</script>

<style scoped>
.fm-wrap{padding:16px;font-family:sans-serif;background:#f9f9f9;min-height:100vh}
.fm-topbar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;margin-bottom:16px}
.fm-title{font-size:24px;font-weight:bold;margin-bottom:8px}
.controls{display:flex;gap:8px;flex-wrap:wrap}
.fm-input{padding:6px 8px;border:1px solid #ccc;border-radius:4px}
.fm-select{padding:6px 8px;border:1px solid #ccc;border-radius:4px}
.fm-button{padding:6px 10px;background:#1976d2;color:#fff;border:none;border-radius:4px;cursor:pointer}
.fm-button:hover{background:#1565c0}
.fm-button-small{padding:4px 8px;background:#1976d2;color:#fff;border:none;border-radius:4px;cursor:pointer}
.fm-button-small:disabled{opacity:0.5;cursor:not-allowed}
.fm-message{text-align:center;color:#555;padding:8px}
.fm-error{color:red;text-align:center;padding:8px}
.fm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.fm-item{background:#fff;border:1px solid #ddd;padding:8px;border-radius:4px;position:relative}
.fm-img{width:100%;height:120px;object-fit:cover;cursor:pointer;border-radius:4px}
.info{margin-top:6px}
.filename{font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.size{font-size:12px;color:#666;margin-top:2px}
.actions{display:flex;gap:4px;margin-top:4px}
.icon-btn{border:none;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center}
.icon-btn.delete{color:red}
.icon-btn.token{color:green}
.icon{width:16px;height:16px}
.fm-pagination{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:16px}
.fm-modal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:50}
.fm-modal-content{background:#fff;padding:16px;border-radius:6px;position:relative;max-width:600px;width:90%}
.fm-modal-content.small{max-width:400px}
.fm-modal-img{width:100%;height:auto;border-radius:4px}
.fm-modal-close{position:absolute;top:8px;right:8px;border:none;background:none;font-size:18px;cursor:pointer}
.token-controls{display:flex;gap:6px;margin-bottom:8px}
.token-controls input, .token-controls select{flex:1;padding:4px 6px;border:1px solid #ccc;border-radius:4px}
.fm-token-url{word-break:break-all;background:#f1f1f1;padding:6px;border-radius:4px;margin-top:6px}
.fm-toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:4px;color:#fff;z-index:60}
.fm-toast.success{background:#4caf50}
.fm-toast.error{background:#f44336}
</style>