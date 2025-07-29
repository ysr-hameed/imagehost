<template>
  <div class="admin-overview">
    <h1 class="title">Dashboard Overview</h1>

    <div class="stats-grid">
      <div class="stat-box" v-for="item in statsList" :key="item.label">
        <div class="stat-label">{{ item.label }}</div>
        <div class="stat-value">{{ item.value }}</div>
      </div>
    </div>

    <div class="last-updated">
      Last Updated: <strong>{{ formatDate(data?.updated_at) }}</strong>
    </div>
  </div>
</template>

<script>
import { onMounted, reactive } from 'vue'
import { getAdminOverview } from '@/api/admin.js'
import { formatDateTime } from '@/utils/format.js'

export default {
  setup() {
    const data = reactive({})

    const fetchOverview = async () => {
      try {
        const res = await getAdminOverview()
        Object.assign(data, res)
      } catch (err) {
        alert('Failed to load dashboard overview')
      }
    }

    onMounted(fetchOverview)

    const formatDate = (dt) => {
      return dt ? formatDateTime(dt) : '-'
    }

    return {
      data,
      formatDate,
      statsList: [
        { label: 'Total Users', key: 'total_users' },
        { label: 'Verified Users', key: 'verified_users' },
        { label: 'Blocked Users', key: 'blocked_users' },
        { label: 'Admin Users', key: 'admin_users' }
      ].map(stat => ({
        ...stat,
        get value() {
          return data[stat.key] ?? '...'
        }
      }))
    }
  }
}
</script>

<style scoped>
.admin-overview {
  padding: 20px;
  font-family: var(--font-main);
}

.title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 20px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}

.stat-box {
  background: var(--bg-alt);
  padding: 16px;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.stat-label {
  font-size: 14px;
  color: var(--text-light);
}

.stat-value {
  font-size: 20px;
  font-weight: bold;
  color: var(--text);
  margin-top: 4px;
}

.last-updated {
  margin-top: 24px;
  font-size: 14px;
  color: var(--text-light);
}
</style>