import { useState, useEffect } from 'react'
import api, { settingsAPI } from '../services/api'
import SettingsPage from './SettingsPage.jsx'
import '../styles/AdminPage.css'

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [cameras, setCameras] = useState([])
  const [settings, setSettings] = useState({})
  const [receiverEmail, setReceiverEmail] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [senderPassword, setSenderPassword] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailSaved, setEmailSaved] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [detectionError, setDetectionError] = useState('')
  const [savingDetection, setSavingDetection] = useState(false)
  const [health, setHealth] = useState(null)
  const [checking, setChecking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const securityUserExists = users.some((user) => user.role === 'security_personnel')

  // Form states
  const [showUserForm, setShowUserForm] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'security_personnel' })
  
  const [showCameraForm, setShowCameraForm] = useState(false)
  const [newCamera, setNewCamera] = useState({ name: '', ip_address: '', rtsp_link: '', location: '' })

  // Fetch users
  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/admin/users')
      setUsers(response.data || [])
    } catch (err) {
      setError('Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  // Fetch cameras
  const fetchCameras = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/settings/cameras')
      setCameras(response.data || [])
    } catch (err) {
      setError('Failed to fetch cameras')
    } finally {
      setLoading(false)
    }
  }

  // Fetch settings
  const fetchSettings = async () => {
    try {
      const response = await api.get('/api/settings/system')
      setSettings(response.data || {})
      const emailSettings = await settingsAPI.getEmailSettings()
      const detectionSettings = await settingsAPI.getDetectionSettings()
      setReceiverEmail(emailSettings.receiver_email || '')
      setSenderEmail(emailSettings.sender_email || '')
      setSenderPassword(emailSettings.sender_password || '')
      setSettings(prev => ({
        ...prev,
        anomaly_threshold: detectionSettings.anomaly_threshold,
        sequence_length: detectionSettings.sequence_length,
        fps_sample: detectionSettings.fps_sample,
        voting_window: detectionSettings.voting_window,
      }))
    } catch (err) {
      setError('Failed to fetch settings')
    }
  }

  useEffect(() => {
    if (activeTab === 'users') fetchUsers()
    else if (activeTab === 'cameras') fetchCameras()
    else if (activeTab === 'settings') fetchSettings()
  }, [activeTab])

  // Add user
  const handleAddUser = async (e) => {
    e.preventDefault()
    if (securityUserExists) {
      setError('Only one security personnel account is allowed')
      setTimeout(() => setError(''), 2500)
      return
    }
    try {
      await api.post('/api/admin/users', newUser)
      alert('User added successfully')
      setNewUser({ name: '', email: '', password: '', role: 'security_personnel' })
      setShowUserForm(false)
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add user')
    }
  }

  // Delete user
  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure?')) return
    try {
      await api.delete(`/api/admin/users/${userId}`)
      alert('User deleted successfully')
      fetchUsers()
    } catch (err) {
      setError('Failed to delete user')
    }
  }

  // Add camera
  const handleAddCamera = async (e) => {
    e.preventDefault()
    try {
      await api.post('/api/settings/cameras', newCamera)
      alert('Camera added successfully')
      setNewCamera({ name: '', ip_address: '', rtsp_link: '', location: '' })
      setShowCameraForm(false)
      fetchCameras()
    } catch (err) {
      setError('Failed to add camera')
    }
  }

  // Delete camera
  const handleDeleteCamera = async (cameraId) => {
    if (!window.confirm('Are you sure?')) return
    try {
      await api.delete(`/api/settings/cameras/${cameraId}`)
      alert('Camera deleted successfully')
      fetchCameras()
    } catch (err) {
      setError('Failed to delete camera')
    }
  }

  // Update settings
  const handleUpdateSettings = async (type) => {
    try {
      if (type === 'detection') {
        await api.put('/api/settings/system/detection', {
          alert_threshold: settings.alert_threshold,
          retention_days: settings.retention_days,
          notify_enabled: settings.notify_enabled,
        })
      } else if (type === 'notification') {
        await api.put('/api/settings/system/notifications', {
          alert_email: settings.alert_email,
          sms_number: settings.sms_number,
        })
      }
      alert('Settings updated successfully')
    } catch (err) {
      setError('Failed to update settings')
    }
  }

  const saveEmailSettings = async () => {
    setEmailError('')
    setSavingEmail(true)
    try {
      await settingsAPI.updateEmailSettings(
        receiverEmail || null,
        senderEmail || null,
        senderPassword || null
      )
      setEmailSaved(true)
      setTimeout(() => setEmailSaved(false), 2500)
    } catch (err) {
      setEmailError(err.response?.data?.detail || 'Failed to update email settings')
    } finally {
      setSavingEmail(false)
    }
  }

  const saveDetectionSettings = async () => {
    setDetectionError('')
    setSavingDetection(true)
    try {
      await settingsAPI.updateDetectionSettings(
        settings.anomaly_threshold,
        settings.sequence_length,
        settings.fps_sample,
        settings.voting_window
      )
      alert('Detection settings updated successfully')
    } catch (err) {
      setDetectionError(err.response?.data?.detail || 'Failed to update detection settings')
    } finally {
      setSavingDetection(false)
    }
  }

  async function checkBackend() {
    setChecking(true)
    try {
      const res = await api.get('/health')
      setHealth(res.data)
    } catch {
      setHealth({ error: 'Cannot reach backend' })
    } finally {
      setChecking(false)
    }
  }

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="admin-page">
      <h1>Admin Panel</h1>

      {error && <div className="error-message">{error}</div>}

      <div className="admin-tabs">
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          User Management
        </button>
        <button
          className={`tab-btn ${activeTab === 'cameras' ? 'active' : ''}`}
          onClick={() => setActiveTab('cameras')}
        >
          Camera Configuration
        </button>
        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          System Settings
        </button>
      </div>

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div className="tab-content">
          <div className="header-section">
            <h2>User Management</h2>
            <button className="btn-primary" onClick={() => setShowUserForm(!showUserForm)}>
              + Add User
            </button>
          </div>

          {showUserForm && (
            <form className="form-section" onSubmit={handleAddUser}>
              <input
                type="text"
                placeholder="Name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                required
              />
              <input
                type="email"
                placeholder="Email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                required
              />
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                disabled
              >
                <option value="security_personnel">Security Personnel</option>
              </select>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 5 }}>
                New accounts can only be created as security personnel.
              </div>
              <button type="submit" className="btn-primary">Create User</button>
              <button type="button" className="btn-secondary" onClick={() => setShowUserForm(false)}>
                Cancel
              </button>
            </form>
          )}

          <div className="search-section">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <table className="users-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Badge ID</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.user_id}>
                  <td>{user.user_id.substring(0, 8)}</td>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td><span className="role-badge">{user.role}</span></td>
                  <td>{user.badge_id || '-'}</td>
                  <td>{user.active ? '✓ Active' : '✗ Inactive'}</td>
                  <td>
                    <button className="btn-small" onClick={() => alert('Edit feature coming soon')}>
                      Edit
                    </button>
                    <button className="btn-small btn-danger" onClick={() => handleDeleteUser(user.user_id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CAMERAS TAB */}
      {activeTab === 'cameras' && (
        <div className="tab-content">
          <div className="header-section">
            <h2>Camera Configuration</h2>
            <button className="btn-primary" onClick={() => setShowCameraForm(!showCameraForm)}>
              + Add Camera
            </button>
          </div>

          {showCameraForm && (
            <form className="form-section" onSubmit={handleAddCamera}>
              <input
                type="text"
                placeholder="Camera Name"
                value={newCamera.name}
                onChange={(e) => setNewCamera({ ...newCamera, name: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="IP Address"
                value={newCamera.ip_address}
                onChange={(e) => setNewCamera({ ...newCamera, ip_address: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="RTSP Link"
                value={newCamera.rtsp_link}
                onChange={(e) => setNewCamera({ ...newCamera, rtsp_link: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="Location"
                value={newCamera.location}
                onChange={(e) => setNewCamera({ ...newCamera, location: e.target.value })}
                required
              />
              <button type="submit" className="btn-primary">Add Camera</button>
              <button type="button" className="btn-secondary" onClick={() => setShowCameraForm(false)}>
                Cancel
              </button>
            </form>
          )}

          <div className="cameras-grid">
            {cameras.map((camera) => (
              <div key={camera.camera_id} className="camera-card">
                <h3>{camera.name}</h3>
                <p><strong>Location:</strong> {camera.location}</p>
                <p><strong>IP:</strong> {camera.ip_address}</p>
                <p><strong>Status:</strong> <span className="status-badge active">{camera.status}</span></p>
                <button className="btn-small btn-danger" onClick={() => handleDeleteCamera(camera.camera_id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div className="tab-content">
          <SettingsPage />
        </div>
      )}

      {loading && <div className="loading">Loading...</div>}
    </div>
  )
}
