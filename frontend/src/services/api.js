import axios from 'axios'

const api = axios.create({ baseURL: '' })

// Auto-attach JWT to every request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  cfg.headers['ngrok-skip-browser-warning'] = 'true'
  return cfg
})

// Response interceptor for better error handling
api.interceptors.response.use(
  response => response,
  error => {
    // If 401, clear token and redirect to login
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

// Settings API methods
export const settingsAPI = {
  getEmailSettings: async () => {
    try {
      const res = await api.get('/api/settings/email')
      return res.data
    } catch (error) {
      console.error('Error fetching email settings:', error)
      throw error
    }
  },
  updateEmailSettings: async (receiverEmail, senderEmail, senderPassword) => {
    try {
      const res = await api.put('/api/settings/email', {
        receiver_email: receiverEmail || undefined,
        sender_email: senderEmail || undefined,
        sender_password: senderPassword || undefined,
      })
      return res.data
    } catch (error) {
      console.error('Error updating email settings:', error)
      throw error
    }
  },
  getDetectionSettings: async () => {
    try {
      const res = await api.get('/api/settings/detection')
      return res.data
    } catch (error) {
      console.error('Error fetching detection settings:', error)
      throw error
    }
  },
  updateDetectionSettings: async (fields) => {
    try {
      const res = await api.put('/api/settings/detection', fields)
      return res.data
    } catch (error) {
      console.error('Error updating detection settings:', error)
      throw error
    }
  },
}

