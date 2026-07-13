import { useState, useEffect } from 'react'
import api from '../services/api'
import '../styles/ReportsPage.css'

export default function ReportsPage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const fetchReport = async (m, y) => {
    try {
      setLoading(true)
      const response = await api.get(`/api/reports/monthly?month=${m}&year=${y}`)
      setReport(response.data)
      setError('')
    } catch (err) {
      console.error('fetchReport error', err)
      setError(err.response?.data?.detail || err.message || 'Failed to fetch report')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReport(month, year)
  }, [month, year])

  const exportReportPDF = async () => {
    try {
      const response = await api.get(`/api/reports/export-pdf?month=${month}&year=${year}`)
      // Create a simple PDF export using the frontend
      const doc = {
        title: `Monthly Report - ${months[month - 1]} ${year}`,
        ...response.data,
      }
      console.log('PDF Export Data:', doc)
      alert('PDF export functionality ready - Use browser print to save as PDF')
      window.print()
    } catch (err) {
      setError('Failed to export PDF')
    }
  }

  return (
    <div className="reports-page page-enter">
      <h1 className="page-title">Monthly Reports</h1>

      {error && <div className="error-message" style={{ marginBottom: 16 }}><span>✗</span>{error}</div>}

      <div className="report-controls">
        <div className="control-group">
          <label>Month:</label>
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
            {months.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label>Year:</label>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <button className="btn btn-primary" onClick={() => fetchReport(month, year)}>
          Generate Report
        </button>

        <button className="btn btn-outline" onClick={exportReportPDF}>
          Export as PDF
        </button>
      </div>

      {report && (
        <div className="report-container">
          <div className="report-header">
            <h2>Monthly Report - {months[month - 1]} {year}</h2>
            <p>Generated: {new Date().toLocaleString()}</p>
          </div>

          {/* Summary Stats */}
          <div className="report-section">
            <h3>Summary Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="label">Total Anomalies</span>
                <span className="value">{report.total_anomalies}</span>
              </div>
              <div className="stat-item">
                <span className="label">Fight</span>
                <span className="value">{report.fighting}</span>
              </div>
              <div className="stat-item">
                <span className="label">Robbery</span>
                <span className="value">{report.robbery}</span>
              </div>
              <div className="stat-item">
                <span className="label">Accident</span>
                <span className="value">{report.accident}</span>
              </div>
            </div>
          </div>

          {/* Weekly breakdown */}
          <div className="report-section">
            <h3>Anomalies per Week</h3>
            <div className="weekly-chart">
              {(() => {
                const weeks = [
                  { label: 'Week 1', start: 1, end: 7 },
                  { label: 'Week 2', start: 8, end: 14 },
                  { label: 'Week 3', start: 15, end: 21 },
                  { label: 'Week 4', start: 22, end: 31 },
                ]
                const values = weeks.map(({ start, end }) => {
                  return Object.entries(report.anomalies_per_day || {}).reduce((sum, [day, count]) => {
                    const dayNum = parseInt(day, 10)
                    return dayNum >= start && dayNum <= end ? sum + count : sum
                  }, 0)
                })
                const maxValue = Math.max(...values, 1)

                return weeks.map((week, index) => (
                  <div key={week.label} className="week-bar">
                    <div className="week-label">{week.label}</div>
                    <div className="week-outer">
                      <div
                        className="week-inner"
                        style={{ width: `${(values[index] / maxValue) * 100}%` }}
                      >
                        <span className="week-count">{values[index]}</span>
                      </div>
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>

          {/* Type distribution */}
          <div className="report-section">
            <h3>Anomaly Type Distribution</h3>
            <div className="type-distribution">
              {Object.entries(report.anomaly_type_distribution || {}).map(([type, count]) => (
                <div key={type} className="type-item">
                  <div className="type-label">{type}</div>
                  <div className="type-bar">
                    <div
                      className="type-fill"
                      style={{ width: `${(count / Math.max(...Object.values(report.anomaly_type_distribution), 1)) * 100}%` }}
                    >
                      {count}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed table */}
          <div className="report-section">
            <h3>Detailed Anomalies</h3>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Type</th>
                  <th>Confidence</th>
                  <th>Camera</th>
                </tr>
              </thead>
              <tbody>
                {report.anomalies && report.anomalies.slice(0, 20).map((anom, i) => (
                  <tr key={i}>
                    <td>{new Date(anom.timestamp).toLocaleString()}</td>
                    <td><span className="badge">{anom.type}</span></td>
                    <td>{(anom.confidence * 100).toFixed(1)}%</td>
                    <td>{anom.camera_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="report-footer">
            <button className="btn btn-outline" onClick={exportReportPDF}>
              Export Report as PDF
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
          Generating report…
        </div>
      )}
    </div>
  )
}
