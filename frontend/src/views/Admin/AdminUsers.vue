<template>
  <div class="admin-users-page">
    <h1>Manage Users</h1>

    <!-- Filters -->
    <div class="admin-filters">
      <input
        v-model="filters.search"
        placeholder="Search by name, email, or username"
      />
      <button class="primary-btn" @click="fetchUsers">Search</button>

      <select v-model="filters.is_verified">
        <option value="">Verified?</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
      <select v-model="filters.is_blocked">
        <option value="">Blocked?</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
      <select v-model="filters.is_admin">
        <option value="">Admin?</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
      <select v-model="filters.provider">
        <option value="">Provider</option>
        <option value="form">Form</option>
        <option value="google">Google</option>
        <option value="github">GitHub</option>
      </select>
    </div>

    <!-- Table -->
    <div class="admin-users-table">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Provider</th>
            <th>Admin</th>
            <th>Verified</th>
            <th>Blocked</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in users"
            :key="user.id"
            @click="openUserDetails(user.id)"
            class="user-row"
          >
            <td>{{ user.first_name }} {{ user.last_name }}</td>
            <td>{{ user.email }}</td>
            <td>{{ user.provider }}</td>
            <td>{{ user.is_admin ? 'Yes' : 'No' }}</td>
            <td>{{ user.is_verified ? 'Yes' : 'No' }}</td>
            <td>{{ user.is_blocked ? 'Yes' : 'No' }}</td>
            <td @click.stop>
              <button class="btn blue" @click="confirmAdmin(user)">
                {{ user.is_admin ? 'Remove Admin' : 'Make Admin' }}
              </button>
              <button class="btn yellow" @click="toggleBlocked(user)">
                {{ user.is_blocked ? 'Unblock' : 'Block' }}
              </button>
              <button class="btn red" @click="confirmDelete(user)">
                Delete
              </button>
            </td>
          </tr>
          <tr v-if="!loading && users.length === 0">
            <td colspan="7">No users found</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="pagination">
      <button :disabled="page === 1" @click="page-- && fetchUsers()">Prev</button>
      <span>Page {{ page }}</span>
      <button :disabled="users.length < limit" @click="page++ && fetchUsers()">Next</button>
    </div>

    <!-- Confirm Admin Modal -->
    <Modal v-if="showAdminModal" title="Confirm Admin Change" @close="showAdminModal = false">
      <p>
        Are you sure you want to
        <strong>{{ selectedUser?.is_admin ? 'remove' : 'grant' }}</strong> admin rights to
        <strong>{{ selectedUser?.email }}</strong>?
      </p>
      <div class="modal-actions">
        <button class="btn gray" @click="showAdminModal = false">Cancel</button>
        <button class="btn" @click="toggleAdmin">Confirm</button>
      </div>
    </Modal>

    <!-- Confirm Delete Modal -->
    <Modal v-if="showDeleteModal" title="Confirm Deletion" @close="showDeleteModal = false">
      <p>
        Are you sure you want to delete
        <strong>{{ selectedUser?.email }}</strong>? This cannot be undone.
      </p>
      <div class="modal-actions">
        <button class="btn gray" @click="showDeleteModal = false">Cancel</button>
        <button class="btn red" @click="deleteSelectedUser">Delete</button>
      </div>
    </Modal>
  </div>
</template>

<script>
import { getAdminUsers, updateUser, deleteUser } from '@/api/admin'
import { getCurrentUser } from '@/api/user'
import Modal from '@/components/BaseModal.vue'

export default {
  components: { Modal },
  data() {
    return {
      users: [],
      page: 1,
      limit: 10,
      filters: {
        search: '',
        is_verified: '',
        is_blocked: '',
        is_admin: '',
        provider: ''
      },
      currentUser: null,
      selectedUser: null,
      showAdminModal: false,
      showDeleteModal: false,
      loading: false
    }
  },
  async mounted() {
    const res = await getCurrentUser()
    this.currentUser = res
    this.fetchUsers()
  },
  methods: {
    async fetchUsers() {
      this.loading = true
      try {
        const params = { page: this.page, limit: this.limit }
        for (const key in this.filters) {
          if (this.filters[key] !== '') {
            params[key] = this.filters[key]
          }
        }
        const res = await getAdminUsers(params)
        this.users = res.users || []
      } catch (err) {
        console.error('Error loading users', err)
        this.users = []
      } finally {
        this.loading = false
      }
    },
    openUserDetails(id) {
      this.$router.push(`/admin/users/${id}`)
    },
    confirmAdmin(user) {
      this.selectedUser = user
      this.showAdminModal = true
    },
    async toggleAdmin() {
      if (!this.selectedUser) return
      await updateUser(this.selectedUser.id, {
        is_admin: !this.selectedUser.is_admin
      })
      this.showAdminModal = false
      this.fetchUsers()
    },
    async toggleBlocked(user) {
      await updateUser(user.id, { is_blocked: !user.is_blocked })
      this.fetchUsers()
    },
    confirmDelete(user) {
      this.selectedUser = user
      this.showDeleteModal = true
    },
    async deleteSelectedUser() {
      try {
        await deleteUser(this.selectedUser.id)
        this.showDeleteModal = false
        this.fetchUsers()
      } catch (err) {
        alert('Failed to delete user.')
        console.error(err)
      }
    }
  }
}
</script>

<style scoped>
/* use your existing styles + red button */
.btn.red {
  background: #e03131;
  color: white;
}

.btn.red:hover {
  background: #c92a2a;
}
@import '@/assets/styles/variables.css';
@import '@/assets/styles/utils.css';

.admin-users-page {
  padding: 24px;
  
}

.admin-users-page h1 {
  font-size: 22px;
  margin-bottom: 20px;
  font-weight: 600;
}

.admin-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.admin-filters input,
.admin-filters select {
  padding: 8px 12px;
  font-size: 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}

.admin-filters .primary-btn {
  background-color: var(--primary);
  color: white;
  border: none;
  padding: 8px 14px;
  border-radius: var(--radius);
  cursor: pointer;
}

.admin-users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  overflow:scroll;
}

thead {
  background: var(--bg);
}

th, td {
  padding: 10px;
  border: 1px solid var(--border);
  white-space: nowrap;
  text-align: left;
}

.user-row {
  cursor: pointer;
  transition: background 0.2s;
}
.user-row:hover {
  background-color: var(--hover-light);
}

td button.btn {
  padding: 4px 10px;
  font-size: 13px;
  border: none;
  border-radius: 6px;
  margin: 2px;
  cursor: pointer;
}


.btn.gray {
  background: var(--primary);
  color: black;
}

.pagination {
  margin-top: 20px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}
.pagination button {
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 6px;
  border: none;
  background: var(--primary);
  color: white;
  cursor: pointer;
}
.pagination button:disabled {
  background: #bbb;
  cursor: not-allowed;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>