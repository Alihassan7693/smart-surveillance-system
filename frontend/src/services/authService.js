import api from './api.js'

export async function login(username, password) {
  const res = await api.post('/api/auth/login', { username, password })
  localStorage.setItem('token', res.data.token)
  localStorage.setItem('user_id', res.data.user_id)
  localStorage.setItem('userName', res.data.name)
  localStorage.setItem('userEmail', res.data.email)
  localStorage.setItem('userRole', res.data.role)
  return res.data
}

export function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user_id')
  localStorage.removeItem('userName')
  localStorage.removeItem('userEmail')
  localStorage.removeItem('userRole')
}

export function isAuthenticated() {
  return !!localStorage.getItem('token')
}

export function getCurrentUser() {
  return {
    user_id: localStorage.getItem('user_id'),
    name: localStorage.getItem('userName'),
    email: localStorage.getItem('userEmail'),
    role: localStorage.getItem('userRole'),
  }
}

export function getUserRole() {
  return localStorage.getItem('userRole')
}

export function isAdmin() {
  return localStorage.getItem('userRole') === 'admin'
}
