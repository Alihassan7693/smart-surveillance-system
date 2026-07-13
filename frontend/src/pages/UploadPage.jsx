import { BACKEND_WS } from '../config.js'
import { useRef, useState, useCallback } from 'react'

const CHUNK_SIZE = 64 * 1024   // 64 KB per chunk

const BADGE_COLOR = {
  Fighting:        '#ef4444',
  Robery:          '#f97316',
  explosion:       '#eab308',
  'road accidents':'#8b5cf6',
  shooting:        '#ec4899',
}

function typeColor(t) { return BADGE_COLOR[t] || '#3b82f6' }

export default function UploadPage() {
  const [file, setFile]         = useState(null)
  const [status, setStatus]     = useState('idle')   // idle | uploading | analyzing | done | error
  const [progress, setProgress] = useState(0)         // 0-100
  const [frameInfo, setFrameInfo] = useState(null)    // latest frame message
  const [summary, setSummary]   = useState(null)
  const [logLines, setLogLines] = useState([])

  const canvasRef = useRef(null)
  const wsRef     = useRef(null)
  const imgRef    = useRef(new Image())

  function log(msg) {
    setLogLines(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 60))
  }

  function reset() {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    setStatus('idle')
    setProgress(0)
    setFrameInfo(null)
    setSummary(null)
    setLogLines([])
    setFile(null)
  }

  const drawFrame = useCallback((b64jpeg) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    imgRef.current.onload = () => {
      canvas.width  = imgRef.current.naturalWidth  || canvas.width
      canvas.height = imgRef.current.naturalHeight || canvas.height
      ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height)
    }
    imgRef.current.src = `data:image/jpeg;base64,${b64jpeg}`
  }, [])

  async function startAnalysis() {
    if (!file) return

    setStatus('uploading')
    setProgress(0)
    setSummary(null)
    setLogLines([])
    log(`Connecting to backend…`)

    // Build WebSocket URL (works locally + through vite proxy)
    const wsUrl = `${BACKEND_WS}/api/video/ws/analyze`
    const ws    = new WebSocket(wsUrl)
    wsRef.current = ws
    ws.binaryType = 'arraybuffer'

    ws.onopen = async () => {
      log(`Connected — sending ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`)

      // 1. Send metadata
      ws.send(JSON.stringify({ filename: file.name, size: file.size }))

      // 2. Send file in chunks
      const buffer = await file.arrayBuffer()
      let offset   = 0
      while (offset < buffer.byteLength) {
        const chunk = buffer.slice(offset, offset + CHUNK_SIZE)
        ws.send(chunk)
        offset += chunk.byteLength
        setProgress(Math.round((offset / buffer.byteLength) * 40))   // 0-40% = upload
        await new Promise(r => setTimeout(r, 0))   // yield to event loop
      }

      // 3. Signal done
      ws.send(JSON.stringify({ type: 'upload_complete' }))
      setStatus('analyzing')
      log('Upload complete — analysis started')
    }

    ws.onmessage = (evt) => {
      if (typeof evt.data !== 'string') return
      let msg
      try { msg = JSON.parse(evt.data) } catch { return }

      if (msg.type === 'ready') {
        log(`Video ready — ${msg.total_frames} total frames @ ${msg.fps?.toFixed(1)} FPS`)
      }

      if (msg.type === 'frame') {
        // Draw frame on canvas (overlay already drawn server-side)
        if (msg.frame) drawFrame(msg.frame)

        // Update progress: 40-95%
        const pct = msg.total_frames > 0
          ? 40 + Math.round((msg.frame_num / msg.total_frames) * 55)
          : 40
        setProgress(Math.min(pct, 95))

        setFrameInfo(msg)
      }

      if (msg.type === 'complete') {
        setProgress(100)
        setStatus('done')
        setSummary(msg)
        log(`Done — ${msg.clips_analyzed} clips analyzed, anomaly: ${msg.anomalies_found}, email: ${msg.email_sent}`)
      }

      if (msg.type === 'error') {
        setStatus('error')
        log(`ERROR: ${msg.message}`)
      }
    }

    ws.onerror = () => {
      setStatus('error')
      log('WebSocket error — is the backend running?')
    }

    ws.onclose = () => {
      if (status !== 'done') log('Connection closed')
    }
  }

  const isRunning = status === 'uploading' || status === 'analyzing'

  return (
    <>
      <h1 className="page-title">Upload Video Analysis</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

        {/* LEFT: canvas + controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Canvas — server draws the overlays directly on frames */}
          <div className="card" style={{ padding: 12 }}>
            <canvas
              ref={canvasRef}
              width={640} height={360}
              style={{
                width: '100%', borderRadius: 8,
                background: '#000',
                display: 'block',
              }}
            />
          </div>

          {/* Live status badges */}
          {frameInfo && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span className={`badge ${frameInfo.is_anomaly ? 'badge-anomaly' : 'badge-normal'}`}
                style={{ fontSize: 14, padding: '6px 16px' }}>
                {frameInfo.is_anomaly ? '⚠ ANOMALY' : '✓ NORMAL'}
              </span>
              {frameInfo.is_anomaly && frameInfo.anomaly_class && (
                <span className="badge badge-type"
                  style={{ fontSize: 14, padding: '6px 16px', background: typeColor(frameInfo.anomaly_class) + '22',
                           color: typeColor(frameInfo.anomaly_class) }}>
                  {frameInfo.anomaly_class.toUpperCase()}
                  {frameInfo.stage2_conf > 0 && ` · ${(frameInfo.stage2_conf * 100).toFixed(1)}%`}
                </span>
              )}
              <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>
                Confidence: {((frameInfo.is_anomaly
                  ? frameInfo.stage1_conf
                  : 1 - frameInfo.stage1_conf) * 100).toFixed(1)}%
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>
                Frame: {frameInfo.frame_num} / {frameInfo.total_frames}
              </span>
            </div>
          )}

          {/* Progress bar */}
          {isRunning && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                {status === 'uploading' ? 'Uploading…' : 'Analyzing…'} {progress}%
              </div>
              <div className="progress-bar" style={{ height: 8 }}>
                <div className="progress-bar-fill"
                  style={{ width: `${progress}%`, background: 'var(--accent)' }} />
              </div>
            </div>
          )}

          {/* Summary card */}
          {summary && (
            <div className="card" style={{
              border: `1px solid ${summary.anomalies_found ? 'rgba(239,68,68,.4)' : 'rgba(34,197,94,.4)'}`,
              background: summary.anomalies_found ? 'rgba(239,68,68,.07)' : 'rgba(34,197,94,.07)',
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
                {summary.anomalies_found ? '⚠ Anomaly Detected' : '✅ No Anomaly Detected'}
              </h3>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Clips analyzed: <b style={{ color: 'var(--text-primary)' }}>{summary.clips_analyzed}</b></span>
                <span>Total frames: <b style={{ color: 'var(--text-primary)' }}>{summary.total_frames}</b></span>
                <span>Email alert sent: <b style={{ color: summary.email_sent ? '#4ade80' : 'var(--text-primary)' }}>
                  {summary.email_sent ? '✓ Yes' : 'No'}
                </b></span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: file picker + log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* File picker */}
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Select Video</h2>
            <input
              type="file"
              accept="video/*"
              disabled={isRunning}
              onChange={e => { setFile(e.target.files[0] || null); setSummary(null) }}
              style={{ fontSize: 13, marginBottom: 12 }}
            />
            {file && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                {file.name} &nbsp;·&nbsp; {(file.size / 1024 / 1024).toFixed(1)} MB
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                disabled={!file || isRunning}
                onClick={startAnalysis}
              >
                {isRunning ? '⏳ Running…' : '▶ Analyze'}
              </button>
              {(isRunning || status !== 'idle') && (
                <button className="btn btn-outline" onClick={reset}>
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Log panel */}
          <div className="card" style={{ flex: 1 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Log</h2>
            <div style={{
              height: 340, overflowY: 'auto',
              fontFamily: 'monospace', fontSize: 11,
              color: 'var(--text-muted)',
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              {logLines.length === 0
                ? <span style={{ color: 'var(--border)' }}>Nothing yet…</span>
                : logLines.map((l, i) => <span key={i}>{l}</span>)
              }
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
