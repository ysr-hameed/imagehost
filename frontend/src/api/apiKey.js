// Ensure this file has proper named exports
import axios from '@/api/axios'

export const getApiKeys = () => axios.get('/me/api-keys')

export const createApiKey = (name) => axios.post('/me/api-keys', { name })

export const regenerateApiKey = (id) => axios.post(`/me/api-keys/${id}/regenerate`)

export const deleteApiKey = (id) => axios.delete(`/me/api-keys/${id}`)