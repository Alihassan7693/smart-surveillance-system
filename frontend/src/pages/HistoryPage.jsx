import { useEffect, useState } from 'react'
import { getDetections } from '../services/detectionService.js'
import { BACKEND_HTTP } from '../config.js'

const TYPE_COLORS = {
  Fight:    '#ef4444',
  Robbery:  '#f97316',
  Accident: '#8b5cf6',
}

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString()
}

function color(t) { return TYPE_COLORS[t] || '#3b82f6' }

export default function HistoryPage() {
  const [detections, setDetections] = useState([])
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await getDetections()
        setDetections(data)
      } catch {
        setError('Failed to load detections. Is Firebase configured?')
      } finally {
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 20_000)
    return () => clearInterval(id)
  }, [])

  const filtered = detections.filter(d =>
    d.anomaly_type?.toLowerCase().includes(search.toLowerCase()) ||
    d.timestamp?.includes(search)
  )

  return (
    <div className="page-enter">
      <h1 className="page-title">Detection History</h1>

      <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by type or date…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 300 }}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <div className="error-message" style={{marginBottom: 20}}>
          <span>✗</span>
          {error}
        </div>
      )}

      <div className="card">
        {loading
          ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
          : filtered.length === 0
            ? <p style={{ color: 'var(--text-muted)' }}>
                {detections.length === 0 ? 'No detections saved yet.' : 'No results for this search.'}
              </p>
            : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Timestamp</th>
                    <th>Anomaly Type</th>
                    <th>Confidence</th>
                    <th>Clip</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {d.id}
                      </td>
                      <td style={{ fontSize: 13 }}>{fmt(d.timestamp)}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: color(d.anomaly_type) + '22',
                            color: color(d.anomaly_type),
                          }}
                        >
                          {d.anomaly_type}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="progress-bar" style={{ width: 80 }}>
                            <div className="progress-bar-fill"
                              style={{
                                width: `${(d.confidence * 100).toFixed(0)}%`,
                                background: color(d.anomaly_type),
                              }} />
                          </div>
                          <span style={{ fontSize: 12 }}>
                            {(d.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td>
                        {d.clip_url
                          ? <a
                              href={d.clip_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: 'var(--accent)', fontSize: 13 }}
                            >
                              ▶ Play
                            </a>
                          : d.clip_file
                            ? <a
                                href={`${BACKEND_HTTP}/api/video/clip/${d.clip_file}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: 'var(--accent)', fontSize: 13 }}
                              >
                                ▶ Play
                              </a>
                            : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        }
      </div>
    </div>
  )
}
