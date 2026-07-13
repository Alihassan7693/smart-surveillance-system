import { BACKEND_WS } from '../config.js'
import { useRef, useState, useEffect, useCallback } from 'react'
import { useStream } from '../context/StreamContext.jsx'

const FRAME_INTERVAL_MS = 100   // 10 fps to backend

const BADGE_COLOR = {
  Fight:    '#ef4444',
  Robbery:  '#f97316',
  Accident: '#8b5cf6',
}

const BRAND_OPTS = [
  { value: 'generic',   label: 'Generic / Unknown' },
  { value: 'hikvision', label: 'Hikvision' },
  { value: 'dahua',     label: 'Dahua' },
  { value: 'reolink',   label: 'Reolink' },
  { value: 'tp_link',   label: 'TP-Link Tapo' },
  { value: 'axis',      label: 'Axis' },
]

function buildRtspUrl(brand, ip, port, user, pass) {
  if (!ip.trim()) return ''
  const p    = (port || '554').trim()
  const u    = (user || '').trim()
  const pw   = pass || ''
  const auth = u && pw ? `${u}:${pw}@` : (u ? `${u}@` : '')
  const host = ip.trim()
  switch (brand) {
    case 'hikvision': return `rtsp://${auth}${host}:${p}/Streaming/Channels/101`
    case 'dahua':     return `rtsp://${auth}${host}:${p}/cam/realmonitor?channel=1&subtype=0`
    case 'reolink':   return `rtsp://${auth}${host}:${p}/h264Preview_01_main`
    case 'tp_link':   return `rtsp://${auth}${host}:${p}/stream1`
    case 'axis':      return `rtsp://${auth}${host}/axis-media/media.amp`
    default:          return `rtsp://${auth}${host}:${p}/stream`
  }
}

// ── Small form helpers ────────────────────────────────────────────────────────
const IS = {
  width: '100%', fontSize: 12, padding: '7px 10px', borderRadius: 6,
  border: '1px solid #3b4252', background: '#0f172a', color: '#fff',
  boxSizing: 'border-box',
}
const LS = { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }

function Lbl({ children }) { return <label style={LS}>{children}</label> }
function FInput({ label, xStyle, ...props }) {
  return (
    <div>
      {label && <Lbl>{label}</Lbl>}
      <input style={{ ...IS, ...xStyle }} {...props} />
    </div>
  )
}
function FSelect({ label, children, ...props }) {
  return (
    <div>
      {label && <Lbl>{label}</Lbl>}
      <select style={{ ...IS }} {...props}>{children}</select>
    </div>
  )
}
function UrlPreview({ url }) {
  if (!url) return null
  return (
    <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.6)', background: '#0a1020', borderRadius: 5, padding: '6px 9px', fontFamily: 'monospace', wordBreak: 'break-all', border: '1px solid rgba(59,130,246,0.12)' }}>
      {url}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LiveFeedPage() {
  // RTSP state lives in StreamContext and persists when navigating away
  const stream = useStream()

  // Webcam-only local state — resets on unmount
  const [webcamActive,    setWebcamActive]    = useState(false)
  const [webcamResult,    setWebcamResult]    = useState(null)
  const [webcamBuffering, setWebcamBuffering] = useState(null)
  const [localError,      setLocalError]      = useState('')

  // Connection panel state
  const [connTab,   setConnTab]   = useState(() => stream.rtspMode !== 'idle' ? 'rtsp' : 'webcam')
  const [netBrand,  setNetBrand]  = useState('generic')
  const [netIp,     setNetIp]     = useState('')
  const [netPort,   setNetPort]   = useState('554')
  const [netUser,   setNetUser]   = useState('admin')
  const [netPass,   setNetPass]   = useState('')
  const [netAdv,    setNetAdv]    = useState(false)
  const [netRawUrl, setNetRawUrl] = useState('')
  const [dirBrand,  setDirBrand]  = useState('generic')
  const [dirIp,     setDirIp]     = useState('')
  const [dirPort,   setDirPort]   = useState('554')
  const [dirUser,   setDirUser]   = useState('admin')
  const [dirPass,   setDirPass]   = useState('')

  // Webcam refs
  const videoRef           = useRef(null)
  const webcamWsRef        = useRef(null)   // webcam WebSocket only (RTSP WS is in StreamContext)
  const intervalRef        = useRef(null)
  const streamRef          = useRef(null)   // MediaStream
  const rafRef             = useRef(null)
  const processedCanvasRef = useRef(null)
  const webcamResultRef    = useRef(null)   // latest webcam result for RAF overlay
  const activeRef          = useRef(false)  // RAF loop guard

  // Derived mode and display values
  const mode      = webcamActive ? 'webcam' : (stream.rtspMode !== 'idle' ? 'rtsp' : 'none')
  const isRunning = mode !== 'none'

  const displayResult    = webcamActive ? webcamResult    : stream.processedResult
  const displayBuffering = webcamActive ? webcamBuffering : stream.bufferingProgress
  const displayConnecting = !webcamActive && stream.connecting
  const displayError      = localError || stream.error

  // Auto-clear local webcam errors
  useEffect(() => {
    if (!localError) return
    const t = setTimeout(() => setLocalError(''), 4000)
    return () => clearTimeout(t)
  }, [localError])

  // ── Canvas overlay ──────────────────────────────────────────────────────────
  const drawOverlay = useCallback((res, canvas) => {
    if (!canvas || !res) return
    const ctx = canvas.getContext('2d')
    const { is_anomaly, anomaly_class, stage1_conf, stage2_conf } = res
    const label       = is_anomaly ? 'ANOMALY' : 'NORMAL'
    const color       = is_anomaly ? '#dc2626' : '#16a34a'
    const displayConf = is_anomaly ? stage1_conf : (1 - stage1_conf)

    // roundRect is Chrome 99+ / Firefox 112+ — fall back to plain rect on older browsers
    const fillRoundRect = (x, y, w, h, r) => {
      ctx.beginPath()
      if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r) } else { ctx.rect(x, y, w, h) }
      ctx.fill()
    }

    ctx.fillStyle = color
    fillRoundRect(8, 8, 170, 40, 6)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText(label, 16, 34)

    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(8, 52, 170, 8)
    ctx.fillStyle = color
    ctx.fillRect(8, 52, 170 * displayConf, 8)

    if (is_anomaly && anomaly_class) {
      const tc      = BADGE_COLOR[anomaly_class] || '#3b82f6'
      const confPct = stage2_conf != null ? `${(stage2_conf * 100).toFixed(0)}%` : ''
      const text    = confPct ? `${anomaly_class.toUpperCase()} ${confPct}` : anomaly_class.toUpperCase()
      ctx.font = 'bold 14px sans-serif'
      const tw = ctx.measureText(text).width + 20
      const x  = canvas.width - tw - 8
      ctx.fillStyle = tc
      fillRoundRect(x, 8, tw, 40, 6)
      ctx.fillStyle = '#fff'
      ctx.fillText(text, x + 8, 33)
    }
  }, [])

  // ── RTSP canvas rendering ───────────────────────────────────────────────────
  const renderFrameToCanvas = useCallback((frame64, result) => {
    const img = new Image()
    img.onload = () => {
      const pCanvas = processedCanvasRef.current
      if (!pCanvas) return
      const w = img.naturalWidth || 640
      const h = img.naturalHeight || 360
      pCanvas.width = w; pCanvas.height = h
      pCanvas.getContext('2d').drawImage(img, 0, 0)
      if (result) drawOverlay(result, pCanvas)
    }
    img.src = `data:image/jpeg;base64,${frame64}`
  }, [drawOverlay])

  // Register canvas renderer while this page is mounted.
  // When navigating away: renderer is deregistered but WS stays open in context.
  // When navigating back: renderer re-registers and latest frame is redrawn.
  useEffect(() => {
    if (stream.rtspMode === 'idle') {
      stream.frameListenerRef.current = null
      return
    }
    // Draw the last received frame immediately so canvas isn't blank on remount
    if (stream.latestFrameRef.current) {
      renderFrameToCanvas(stream.latestFrameRef.current, stream.latestResultRef.current)
    }
    // Register renderer — invoked for every future frame from StreamContext
    stream.frameListenerRef.current = (data) => {
      renderFrameToCanvas(data.frame, data.buffering ? null : data)
    }
    return () => { stream.frameListenerRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.rtspMode, renderFrameToCanvas])

  // ── Webcam cleanup on unmount — RTSP stream intentionally stays alive ────────
  useEffect(() => {
    return () => {
      if (activeRef.current) stopWebcam()
      stream.frameListenerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Webcam stop ─────────────────────────────────────────────────────────────
  const stopWebcam = useCallback(() => {
    activeRef.current = false
    clearInterval(intervalRef.current); intervalRef.current = null
    cancelAnimationFrame(rafRef.current); rafRef.current = null
    if (webcamWsRef.current) {
      webcamWsRef.current.onclose = null
      webcamWsRef.current.onerror = null
      webcamWsRef.current.close()
      webcamWsRef.current = null
    }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    webcamResultRef.current = null
    setWebcamActive(false)
    setWebcamResult(null)
    setWebcamBuffering(null)
    setLocalError('')
  }, [])

  // ── Webcam start ────────────────────────────────────────────────────────────
  async function startWebcam() {
    setLocalError('')
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = mediaStream
      if (videoRef.current) { videoRef.current.srcObject = mediaStream; videoRef.current.play() }

      const ws = new WebSocket(`${BACKEND_WS}/ws/webcam`)
      webcamWsRef.current = ws

      ws.onopen = () => {
        activeRef.current = true
        setWebcamActive(true)
        webcamResultRef.current = null
        let sized = false
        const renderFrame = () => {
          if (!activeRef.current) return
          const vid = videoRef.current
          if (vid && vid.readyState >= 2) {
            const w = vid.videoWidth || 640
            const h = vid.videoHeight || 360
            const pCanvas = processedCanvasRef.current
            if (!sized && w > 0) {
              if (pCanvas) { pCanvas.width = w; pCanvas.height = h }
              sized = true
            }
            if (pCanvas) {
              const ctx = pCanvas.getContext('2d')
              ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1)
              ctx.drawImage(vid, 0, 0, w, h)
              ctx.restore()
              if (webcamResultRef.current) drawOverlay(webcamResultRef.current, pCanvas)
            }
          }
          rafRef.current = requestAnimationFrame(renderFrame)
        }
        rafRef.current = requestAnimationFrame(renderFrame)

        // Cap capture at 640px wide — backend resizes to 224×224 anyway,
        // so full-resolution frames only waste bandwidth and delay inference.
        const capture = document.createElement('canvas')
        capture.width = 640; capture.height = 360
        intervalRef.current = setInterval(() => {
          const vid = videoRef.current
          if (!vid || vid.readyState < 2) return
          const vw = vid.videoWidth || 640
          const vh = vid.videoHeight || 360
          const scale = Math.min(1, 640 / vw)
          const cw = Math.round(vw * scale)
          const ch = Math.round(vh * scale)
          if (capture.width !== cw || capture.height !== ch) { capture.width = cw; capture.height = ch }
          capture.getContext('2d').drawImage(vid, 0, 0, cw, ch)
          const b64 = capture.toDataURL('image/jpeg', 0.85).split(',')[1]
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'frame', frame: b64 }))
        }, FRAME_INTERVAL_MS)
      }

      ws.onmessage = (evt) => {
        const data = JSON.parse(evt.data)
        if (data.type === 'buffering') {
          setWebcamBuffering({ buffered: data.frames_buffered, needed: data.frames_needed })
        } else if (data.type === 'result') {
          setWebcamBuffering(null)
          webcamResultRef.current = data
          setWebcamResult(data)
        } else if (data.type === 'error') {
          setLocalError(data.message)
        }
      }
      ws.onerror = () => setLocalError('Webcam stream error')
      ws.onclose = () => stopWebcam()
    } catch (e) {
      setLocalError(`Webcam error: ${e.message}`)
    }
  }

  // ── Computed URL values ─────────────────────────────────────────────────────
  const netUrl = netAdv ? netRawUrl : buildRtspUrl(netBrand, netIp, netPort, netUser, netPass)
  const dirUrl = buildRtspUrl(dirBrand, dirIp, dirPort, dirUser, dirPass)
  const rtspRunning = stream.rtspMode !== 'idle'

  // ── Tab style helper ────────────────────────────────────────────────────────
  const tabStyle = (key) => ({
    flex: 1, padding: '10px 6px', fontSize: 12, fontWeight: 600,
    border: connTab === key ? '1px solid rgba(59,130,246,0.45)' : '1px solid transparent',
    borderRadius: 8, cursor: isRunning ? 'default' : 'pointer',
    transition: 'all 0.2s', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: 6, letterSpacing: 0.2,
    background: connTab === key ? 'rgba(59,130,246,0.15)' : 'transparent',
    color: connTab === key ? '#60a5fa' : 'var(--text-muted)',
    opacity: isRunning && connTab !== key ? 0.5 : 1,
  })

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-enter">

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Live Feed</h1>
        {isRunning ? (
          <span className="status-live animate-fade-in">
            <span className="live-dot" />
            LIVE · {mode === 'webcam' ? 'WEBCAM' : connTab === 'direct' ? 'DIRECT CABLE' : 'RTSP'}
          </span>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 20,
            background: 'rgba(148,163,184,0.1)', border: '1px solid var(--border)',
            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
            letterSpacing: 0.5, textTransform: 'uppercase',
          }}>OFFLINE</span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, maxWidth: 780, margin: '0 auto' }}>

        {/* ── VIDEO CANVAS ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Live Stream · AI Detection
          </div>

          <div className="card" style={{ padding: 10, position: 'relative', minHeight: 300 }}>
            <video ref={videoRef} style={{ display: 'none' }} autoPlay playsInline muted />
            <canvas
              ref={processedCanvasRef}
              width={640} height={360}
              style={{ width: '100%', height: 280, borderRadius: 8, background: '#000', display: 'block' }}
            />
            {!isRunning && (
              <div style={{
                position: 'absolute', inset: 10, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 8,
                color: 'var(--text-muted)', fontSize: 13, pointerEvents: 'none',
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                  <path d="M23 7 16 12 23 17z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
                <span style={{ opacity: 0.5 }}>Select a connection mode below and start streaming</span>
              </div>
            )}
          </div>

          {/* Connecting spinner */}
          {displayConnecting && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: '#60a5fa' }}>
              <span style={{
                display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                border: '2px solid rgba(96,165,250,0.3)', borderTopColor: '#60a5fa',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span>Connecting to camera… (up to 15 s)</span>
            </div>
          )}

          {/* Warming up progress */}
          {displayBuffering && !displayResult && !displayConnecting && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                <span>Warming up AI pipeline…</span>
                <span>{displayBuffering.buffered} / {displayBuffering.needed} frames</span>
              </div>
              <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                  width: `${Math.round((displayBuffering.buffered / displayBuffering.needed) * 100)}%`,
                  transition: 'width 0.15s linear',
                }} />
              </div>
            </div>
          )}

          {/* Detection result badges */}
          {displayResult && (
            <div className="animate-fade-in" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span
                className={`badge ${displayResult.is_anomaly ? 'badge-anomaly' : 'badge-normal'}`}
                style={{ fontSize: 13, padding: '5px 12px' }}
              >
                {displayResult.is_anomaly ? '⚠ ANOMALY' : '✓ NORMAL'}
              </span>
              {displayResult.is_anomaly && displayResult.anomaly_class && (
                <span className="badge" style={{
                  fontSize: 12, padding: '5px 12px',
                  background: (BADGE_COLOR[displayResult.anomaly_class] || '#3b82f6') + '22',
                  color:      BADGE_COLOR[displayResult.anomaly_class] || '#3b82f6',
                  border: `1px solid ${(BADGE_COLOR[displayResult.anomaly_class] || '#3b82f6')}44`,
                }}>
                  {displayResult.anomaly_class.toUpperCase()}
                  {displayResult.stage2_conf != null && ` · ${(displayResult.stage2_conf * 100).toFixed(1)}%`}
                </span>
              )}
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {((displayResult.is_anomaly
                  ? displayResult.stage1_conf
                  : 1 - displayResult.stage1_conf) * 100).toFixed(1)}% confidence
              </span>
            </div>
          )}

          {/* Error banner */}
          {displayError && (
            <div className="error-message">
              <span>✗</span>
              <span style={{ fontSize: 12 }}>{displayError}</span>
            </div>
          )}
        </div>

        {/* ── CONNECTION PANEL ── */}
        <div className="card" style={{ padding: 20 }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 4 }}>
            {[
              { key: 'webcam', icon: '📷', label: 'Webcam' },
              { key: 'rtsp',   icon: '📡', label: 'RTSP Network' },
              { key: 'direct', icon: '🔌', label: 'Direct Cable' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => !isRunning && setConnTab(tab.key)}
                style={tabStyle(tab.key)}
              >
                <span style={{ fontSize: 14 }}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ════════ WEBCAM tab ════════ */}
          {connTab === 'webcam' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                display: 'flex', gap: 14, padding: '14px 16px', borderRadius: 10,
                background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)',
              }}>
                <div style={{ fontSize: 32, lineHeight: 1 }}>📷</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 5 }}>Built-in or USB Webcam</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65 }}>
                    Captures live video from your device camera. Frames are sent to the AI pipeline at 10 fps
                    for real-time anomaly detection with a 1.6-second buffer window.
                  </div>
                </div>
              </div>
              {!webcamActive
                ? <button className="btn btn-primary" onClick={startWebcam} disabled={isRunning} style={{ width: '100%' }}>
                    📷  Start Webcam
                  </button>
                : <button className="btn btn-danger" onClick={stopWebcam} style={{ width: '100%' }}>
                    ⏹  Stop Webcam
                  </button>
              }
            </div>
          )}

          {/* ════════ RTSP NETWORK tab ════════ */}
          {connTab === 'rtsp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Connect to an IP camera on your local network via WiFi or a LAN switch using RTSP.
                </div>
                <button
                  onClick={() => setNetAdv(v => !v)}
                  disabled={isRunning}
                  style={{ fontSize: 10, flexShrink: 0, background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 9px', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  {netAdv ? 'Simple' : 'Advanced'}
                </button>
              </div>

              {!netAdv ? (
                <>
                  <FSelect label="Camera Brand" value={netBrand} onChange={e => setNetBrand(e.target.value)} disabled={isRunning}>
                    {BRAND_OPTS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </FSelect>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px', gap: 8 }}>
                    <FInput label="Camera IP Address" value={netIp} onChange={e => setNetIp(e.target.value)} placeholder="192.168.1.100" disabled={isRunning} />
                    <FInput label="Port" value={netPort} onChange={e => setNetPort(e.target.value)} placeholder="554" disabled={isRunning} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <FInput label="Username" value={netUser} onChange={e => setNetUser(e.target.value)} placeholder="admin" disabled={isRunning} />
                    <FInput label="Password" type="password" value={netPass} onChange={e => setNetPass(e.target.value)} placeholder="••••••" disabled={isRunning} />
                  </div>
                  <UrlPreview url={netUrl} />
                </>
              ) : (
                <FInput
                  label="Full RTSP URL"
                  value={netRawUrl}
                  onChange={e => setNetRawUrl(e.target.value)}
                  placeholder="rtsp://user:pass@192.168.1.100:554/stream"
                  disabled={isRunning}
                  xStyle={{ fontFamily: 'monospace', fontSize: 11 }}
                />
              )}

              {rtspRunning
                ? <button className="btn btn-danger" onClick={stream.stopRTSP} style={{ width: '100%' }}>
                    ⏹  Disconnect Camera
                  </button>
                : <button
                    className="btn btn-primary"
                    onClick={() => stream.startRTSP(netUrl)}
                    disabled={isRunning || !netUrl.trim()}
                    style={{ width: '100%' }}
                  >
                    📡  Connect RTSP Camera
                  </button>
              }
            </div>
          )}

          {/* ════════ DIRECT ETHERNET tab ════════ */}
          {connTab === 'direct' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.28)',
                borderRadius: 10, padding: '13px 16px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span>⚡</span> Direct Ethernet Cable Setup
                </div>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: 'rgba(251,191,36,0.8)', lineHeight: 2 }}>
                  <li>Plug the camera directly into your PC's ethernet port with a CAT5e/CAT6 cable</li>
                  <li>Set a <strong style={{ color: '#fbbf24' }}>static IP</strong> on the camera — e.g.{' '}
                    <code style={{ background: 'rgba(0,0,0,0.35)', padding: '1px 6px', borderRadius: 3, fontSize: 11 }}>192.168.0.100</code>
                  </li>
                  <li>Configure your PC's ethernet adapter to the same subnet — e.g.{' '}
                    <code style={{ background: 'rgba(0,0,0,0.35)', padding: '1px 6px', borderRadius: 3, fontSize: 11 }}>192.168.0.1 / 255.255.255.0</code>
                  </li>
                  <li>Enter the camera IP below and click Connect</li>
                </ol>
              </div>

              <FSelect label="Camera Brand" value={dirBrand} onChange={e => setDirBrand(e.target.value)} disabled={isRunning}>
                {BRAND_OPTS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </FSelect>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px', gap: 8 }}>
                <FInput label="Camera IP Address" value={dirIp} onChange={e => setDirIp(e.target.value)} placeholder="192.168.0.100" disabled={isRunning} />
                <FInput label="Port" value={dirPort} onChange={e => setDirPort(e.target.value)} placeholder="554" disabled={isRunning} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <FInput label="Username" value={dirUser} onChange={e => setDirUser(e.target.value)} placeholder="admin" disabled={isRunning} />
                <FInput label="Password" type="password" value={dirPass} onChange={e => setDirPass(e.target.value)} placeholder="••••••" disabled={isRunning} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Quick IP:</span>
                {['192.168.0.100', '192.168.1.100', '10.0.0.100', '169.254.1.1'].map(ip => (
                  <button
                    key={ip}
                    onClick={() => !isRunning && setDirIp(ip)}
                    disabled={isRunning}
                    style={{
                      fontSize: 10, background: 'rgba(59,130,246,0.1)',
                      border: '1px solid rgba(59,130,246,0.28)', borderRadius: 5,
                      padding: '3px 9px', color: '#60a5fa', cursor: 'pointer',
                      fontFamily: 'monospace',
                    }}
                  >
                    {ip}
                  </button>
                ))}
              </div>
              <UrlPreview url={dirUrl} />

              {rtspRunning
                ? <button className="btn btn-danger" onClick={stream.stopRTSP} style={{ width: '100%' }}>
                    ⏹  Disconnect Camera
                  </button>
                : <button
                    className="btn btn-primary"
                    onClick={() => stream.startRTSP(dirUrl)}
                    disabled={isRunning || !dirUrl.trim()}
                    style={{ width: '100%' }}
                  >
                    🔌  Connect Direct Camera
                  </button>
              }
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
