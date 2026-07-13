import { useState, useEffect } from 'react'
import api from '../services/api'
import '../styles/AlertsPage.css'

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([])
  const [filters, setFilters] = useState({
    anomaly_type: '',
    status: 'pending',
    search: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const fetchAlerts = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filters.anomaly_type) params.append('anomaly_type', filters.anomaly_type)
      if (filters.status) params.append('status', filters.status)
      
      const response = await api.get(`/api/alerts/anomalies?${params}`)
      setAlerts(response.data || [])
      setError('')
    } catch (err) {
      console.error('fetchAlerts error', err)
      setError(err.response?.data?.detail || err.message || 'Failed to fetch alerts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAlerts()
  }, [filters])

  const handleAcknowledgeAlert = async (alertId) => {
    try {
      await api.put(`/api/alerts/anomalies/${alertId}/acknowledge`, {})
      setSuccessMsg('Alert acknowledged successfully')
      setTimeout(() => setSuccessMsg(''), 3000)
      fetchAlerts()
    } catch (err) {
      setError('Failed to acknowledge alert')
    }
  }

  const renderConfidenceBar = (confidence) => {
    const pct = (confidence * 100).toFixed(0)
    const barColor = confidence > 0.8 ? '#ef4444' : confidence > 0.6 ? '#f97316' : '#f59e0b'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="progress-bar" style={{ width: 80 }}>
          <div className="progress-bar-fill" style={{ width: `${pct}%`, background: barColor, boxShadow: `0 0 8px ${barColor}80` }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 28 }}>{pct}%</span>
      </div>
    )
  }

  const pendingCount = alerts.filter(a => a.status === 'pending').length

  return (
    <div className="alerts-page page-enter">
      <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        Anomaly Alerts
        {pendingCount > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="alert-dot" />
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--danger)',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 20,
              padding: '2px 10px',
            }}>
              {pendingCount} pending
            </span>
          </span>
        )}
      </h1>

      {successMsg && (
        <div className="success-message" style={{ marginBottom: 16 }}>
          <span>✓</span>
          {successMsg}
        </div>
      )}
      {error && <div className="error-message" style={{ marginBottom: 16 }}><span>✗</span>{error}</div>}

      <div className="tabs">
        <button className="tab-btn active">
          Anomaly Alerts
        </button>
      </div>

      <div className="tab-content animate-fade-up delay-2">
          <div className="filters">
            <input
              type="text"
              placeholder="Search alerts..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
            <select
              value={filters.anomaly_type}
              onChange={(e) => setFilters({ ...filters, anomaly_type: e.target.value })}
            >
              <option value="">All Types</option>
              <option value="Fight">Fight</option>
              <option value="Robbery">Robbery</option>
              <option value="Vandalism">Vandalism</option>
              <option value="Accident">Accident</option>
              <option value="Normal">Normal</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="pending">Pending</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Camera</th>
                <th>Confidence</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr
                  key={alert.alert_id}
                  style={alert.status === 'pending' ? {
                    borderLeft: '3px solid var(--danger)',
                    animation: 'fadeInUp 0.4s ease both',
                  } : { animation: 'fadeInUp 0.4s ease both' }}
                >
                  <td>{new Date(alert.timestamp).toLocaleString()}</td>
                  <td><span className="type-badge">{alert.anomaly_type}</span></td>
                  <td>{alert.camera_name || alert.camera_id}</td>
                  <td>{renderConfidenceBar(alert.confidence)}</td>
                  <td><span className={`status-badge ${alert.status}`}>{alert.status}</span></td>
                  <td>
                    <button
                      className="btn btn-outline"
                      onClick={() => handleAcknowledgeAlert(alert.alert_id)}
                      disabled={alert.status !== 'pending'}
                      style={{ padding: '5px 12px', fontSize: 12 }}
                    >
                      Acknowledge
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {alerts.length === 0 && (
            <div className="empty-state">
              <p>No alerts found. If the system has not detected anomalies yet, alerts will appear here.</p>
            </div>
          )}
        </div>

      {loading && <div className="loading">Loading...</div>}
    </div>
  )
}
