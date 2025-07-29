<template>
  <div class="admin-user-details">
    <h1>User Details Page</h1>

    <!-- Show user card -->
    <div v-if="user" class="user-card">
      <!-- Basic Info -->
      <div class="card-section">
        <h2>Basic Info</h2>
        <div class="card-grid">
          <div class="item"><label>ID</label><span>{{ user.id }}</span></div>
          <div class="item"><label>Username</label><span>{{ user.username }}</span></div>
          <div class="item"><label>Email</label><span>{{ user.email }}</span></div>
          <div class="item"><label>Provider</label><span>{{ user.provider }}</span></div>
        </div>
      </div>

      <!-- Personal -->
      <div class="card-section">
        <h2>Personal</h2>
        <div class="card-grid">
          <div class="item"><label>First Name</label><span>{{ user.first_name }}</span></div>
          <div class="item"><label>Last Name</label><span>{{ user.last_name }}</span></div>
        </div>
      </div>

      <!-- Status -->
      <div class="card-section">
        <h2>Status</h2>
        <div class="card-grid">
          <div class="item"><label>Verified</label><span :class="user.is_verified ? 'yes' : 'no'">{{ user.is_verified ? 'Yes' : 'No' }}</span></div>
          <div class="item"><label>Blocked</label><span :class="user.is_blocked ? 'yes' : 'no'">{{ user.is_blocked ? 'Yes' : 'No' }}</span></div>
          <div class="item"><label>Admin</label><span :class="user.is_admin ? 'yes' : 'no'">{{ user.is_admin ? 'Yes' : 'No' }}</span></div>
        </div>
      </div>

      <!-- Metadata -->
      <div class="card-section">
        <h2>Metadata</h2>
        <div class="card-grid">
          <div class="item"><label>Created At</label><span>{{ formatDate(user.created_at) }}</span></div>
          <div class="item"><label>Updated At</label><span>{{ formatDate(user.updated_at) }}</span></div>
        </div>
      </div>

      <!-- DELETE Button -->
      <div class="actions">
        <button class="danger-btn" @click="confirmDelete">Delete User</button>
      </div>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="loading">Loading user details...</div>

    <!-- Error -->
    <div v-else-if="error" class="error">❌ Failed to load user details.</div>
  </div>
</template>

<script>
import { getUserById, deleteUser } from '@/api/admin'
import { formatDateTime } from '@/utils/format'

export default {
  data() {
    return {
      user: null,
      loading: true,
      error: false,
    }
  },
  methods: {
    formatDate(date) {
      return date ? formatDateTime(date) : '-'
    },
    async confirmDelete() {
      if (!confirm(`Are you sure you want to delete "${this.user.username}"? This cannot be undone.`)) return

      try {
        const res = await deleteUser(this.user.id)
        if (res?.data?.success) {
          alert('✅ User deleted successfully.')
          this.$router.push('/admin/users')
        } else {
          alert('❌ Failed to delete user.')
        }
      } catch (err) {
        console.error('❌ Error deleting user:', err)
        alert('❌ Error deleting user.')
      }
    }
  },
  async mounted() {
    const id = this.$route.params.id
    try {
      const res = await getUserById(id)
      if (res?.data?.data?.id) {
        this.user = res.data.data
      } else {
        this.error = true
      }
    } catch (err) {
      console.error('❌ Error fetching user:', err)
      this.error = true
    } finally {
      this.loading = false
    }
  }
}
</script>

<style scoped>
.admin-user-details {
  padding: 24px;
  font-family: var(--font-inter);
}

h1 {
  font-size: 1.6rem;
  font-weight: 600;
  margin-bottom: 20px;
}

.user-card {
  background: var(--surface-1);
  padding: 24px;
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.card-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-section h2 {
  font-size: 1.1rem;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.item {
  background: var(--surface-2);
  padding: 12px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}

.item label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.item span {
  font-weight: 500;
  font-size: 14px;
  color: var(--text-primary);
}

span.yes {
  color: green;
  font-weight: bold;
}

span.no {
  color: red;
  font-weight: bold;
}

.loading,
.error {
  padding: 24px;
  font-size: 16px;
  text-align: center;
  color: var(--text-secondary);
}

.actions {
  margin-top: 16px;
  text-align: right;
}

.danger-btn {
  background: #e03131;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.danger-btn:hover {
  background: #c92a2a;
}
</style>