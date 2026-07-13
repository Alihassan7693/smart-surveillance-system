import api from './api.js'

export async function getDetections() {
  const res = await api.get('/api/detections')
  return res.data
}

export async function getStats() {
  const res = await api.get('/api/detections/stats')
  return res.data
}

export async function checkHealth() {
  const res = await api.get('/health')
  return res.data
}
