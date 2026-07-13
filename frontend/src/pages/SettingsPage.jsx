import { useState, useEffect } from 'react'
import api, { settingsAPI } from '../services/api.js'

// ── small reusable components ────────────────────────────────────────────────
function Field({ label, hint, timing, children }) {
  return (
    <div>
      <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{hint}</div>}
      {timing && (
        <div style={{ color: '#60a5fa', fontSize: 12, marginTop: 3, fontStyle: 'italic' }}>
          ⏱ {timing}
        </div>
      )}
    </div>
  )
}

function SavedBanner() {
  return (
    <div style={{
      background: 'var(--success-light)', color: 'var(--success)',
      padding: '10px 14px', borderRadius: 8, marginBottom: 14,
      fontSize: 12, fontWeight: 600, border: '1px solid var(--success)',
      display: 'flex', gap: 8, alignItems: 'center',
    }}>
      <span>✓</span> Saved successfully
    </div>
  )
}

function ErrorBanner({ msg }) {
  return (
    <div style={{
      color: 'var(--danger)', background: 'var(--danger-light)',
      padding: '10px 14px', borderRadius: 8,
      fontSize: 12, fontWeight: 600, border: '1px solid var(--danger)',
      display: 'flex', gap: 8, alignItems: 'center',
    }}>
      <span>✗</span> {msg}
    </div>
  )
}

// ── timing helpers ────────────────────────────────────────────────────────────
function uploadTiming(seqLen, votingWin) {
  const secPerWindow = (seqLen / 30).toFixed(1)
  const alertAfter   = ((seqLen / 30) * votingWin).toFixed(1)
  return `1 window = ${secPerWindow}s at 30fps  ·  alert after ${votingWin} windows = ${alertAfter}s of continuous anomaly`
}

function webcamTiming(consecThresh) {
  // fixed: 16 frames at 10fps, step=8
  const updateEvery = (8 / 10).toFixed(1)
  const alertAfter  = ((8 / 10) * consecThresh).toFixed(1)
  return `1 window = 1.6s  ·  updates every ${updateEvery}s (sliding)  ·  alert after ${consecThresh} windows = ${alertAfter}s of continuous anomaly`
}

function rtspTiming(seqLen, consecThresh) {
  const secPerWindow  = (seqLen / 30).toFixed(1)
  const updateEvery   = ((seqLen / 2) / 30).toFixed(1)
  const alertAfter    = (((seqLen / 2) / 30) * consecThresh).toFixed(1)
  return `1 window = ${secPerWindow}s at 30fps  ·  updates every ${updateEvery}s (50% overlap)  ·  alert after ${consecThresh} windows = ${alertAfter}s of continuous anomaly`
}

// ── main component ────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [globalSaved, setGlobalSaved] = useState(false)

  // Email
  const [receiverEmail,   setReceiverEmail]   = useState('')
  const [senderEmail,     setSenderEmail]     = useState('')
  const [senderPassword,  setSenderPassword]  = useState('')
  const [loadingEmail,    setLoadingEmail]    = useState(false)
  const [savingEmail,     setSavingEmail]     = useState(false)
  const [emailError,      setEmailError]      = useState('')
  const [emailSaved,      setEmailSaved]      = useState(false)
  const [testingEmail,    setTestingEmail]    = useState(false)
  const [testEmailResult, setTestEmailResult] = useState(null)

  // Shared
  const [anomalyThreshold, setAnomalyThreshold] = useState(0.75)

  // Video upload
  const [uploadSeqLen,      setUploadSeqLen]      = useState(48)
  const [uploadVotingWin,   setUploadVotingWin]   = useState(3)

  // Webcam
  const [webcamConsec, setWebcamConsec] = useState(2)

  // RTSP
  const [rtspSeqLen,  setRtspSeqLen]  = useState(48)
  const [rtspConsec,  setRtspConsec]  = useState(2)

  const [loadingDetection, setLoadingDetection] = useState(false)
  const [savingDetection,  setSavingDetection]  = useState(false)
  const [detectionError,   setDetectionError]   = useState('')
  const [detectionSaved,   setDetectionSaved]   = useState(false)

  // Health
  const [health,    setHealth]    = useState(null)
  const [checking,  setChecking]  = useState(false)

  useEffect(() => { loadEmailSettings(); loadDetectionSettings() }, [])

  // ── loaders ──────────────────────────────────────────────────────────────
  async function loadEmailSettings() {
    setLoadingEmail(true)
    try {
      const s = await settingsAPI.getEmailSettings()
      setReceiverEmail(s.receiver_email)
      setSenderEmail(s.sender_email)
      setSenderPassword(s.sender_password)
      setEmailError('')
    } catch { setEmailError('Failed to load. Make sure you are logged in.') }
    finally  { setLoadingEmail(false) }
  }

  async function loadDetectionSettings() {
    setLoadingDetection(true)
    try {
      const s = await settingsAPI.getDetectionSettings()
      setAnomalyThreshold(s.anomaly_threshold)
      setUploadSeqLen(s.upload_sequence_length)
      setUploadVotingWin(s.upload_voting_window)
      setWebcamConsec(s.webcam_consecutive_threshold)
      setRtspSeqLen(s.rtsp_sequence_length)
      setRtspConsec(s.rtsp_consecutive_threshold)
      setDetectionError('')
    } catch { setDetectionError('Failed to load. Make sure you are logged in.') }
    finally  { setLoadingDetection(false) }
  }

  // ── savers ───────────────────────────────────────────────────────────────
  async function saveEmailSettings() {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (receiverEmail && !emailRe.test(receiverEmail)) { setEmailError('Receiver email is invalid'); return }
    if (senderEmail   && !emailRe.test(senderEmail))   { setEmailError('Sender email is invalid');   return }
    setSavingEmail(true)
    try {
      await settingsAPI.updateEmailSettings(receiverEmail || null, senderEmail || null, senderPassword || null)
      setEmailError(''); setEmailSaved(true); setTimeout(() => setEmailSaved(false), 2500)
    } catch (err) {
      setEmailError('Error: ' + (err.response?.data?.detail || err.message))
    } finally { setSavingEmail(false) }
  }

  async function saveDetectionSettings() {
    if (anomalyThreshold < 0 || anomalyThreshold > 1) { setDetectionError('Threshold must be 0–1'); return }
    if (uploadSeqLen   <= 0) { setDetectionError('Upload sequence length must be > 0'); return }
    if (uploadVotingWin <= 0) { setDetectionError('Upload voting window must be > 0'); return }
    if (webcamConsec   <= 0) { setDetectionError('Webcam consecutive threshold must be > 0'); return }
    if (rtspSeqLen     <= 0) { setDetectionError('RTSP sequence length must be > 0'); return }
    if (rtspConsec     <= 0) { setDetectionError('RTSP consecutive threshold must be > 0'); return }

    setSavingDetection(true)
    try {
      await settingsAPI.updateDetectionSettings({
        anomaly_threshold:            anomalyThreshold,
        upload_sequence_length:       uploadSeqLen,
        upload_voting_window:         uploadVotingWin,
        webcam_consecutive_threshold: webcamConsec,
        rtsp_sequence_length:         rtspSeqLen,
        rtsp_consecutive_threshold:   rtspConsec,
      })
      setDetectionError(''); setDetectionSaved(true); setTimeout(() => setDetectionSaved(false), 2500)
    } catch (err) {
      setDetectionError('Error: ' + (err.response?.data?.detail || err.message))
    } finally { setSavingDetection(false) }
  }

  async function sendTestEmail() {
    setTestingEmail(true)
    setTestEmailResult(null)
    try {
      const r = await api.post('/api/settings/test-email')
      setTestEmailResult({ ok: r.data.success, msg: r.data.message })
    } catch (err) {
      setTestEmailResult({ ok: false, msg: err.response?.data?.detail || 'Request failed — check backend logs.' })
    } finally { setTestingEmail(false) }
  }

  async function checkBackend() {
    setChecking(true)
    try   { const r = await api.get('/health'); setHealth(r.data) }
    catch { setHealth({ error: 'Cannot reach backend' }) }
    finally { setChecking(false) }
  }

  const numInput = (val, set, min = 1, step = 1) => (
    <input type="number" min={min} step={step} value={val}
      onChange={e => { set(step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value)); setDetectionError('') }}
      disabled={loadingDetection || savingDetection}
    />
  )

  return (
    <div className="page-enter">
      <h1 className="page-title">Settings</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>

        {/* ── EMAIL ───────────────────────────────────────────────────────── */}
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>📧 Email Alerts</h2>
          {emailSaved && <SavedBanner />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Receiver Email" hint="Where to send anomaly alerts">
              <input type="email" value={receiverEmail}
                onChange={e => { setReceiverEmail(e.target.value); setEmailError('') }}
                disabled={loadingEmail || savingEmail} placeholder="recipient@example.com" />
            </Field>
            <Field label="Sender Email" hint="Gmail address for sending alerts">
              <input type="email" value={senderEmail}
                onChange={e => { setSenderEmail(e.target.value); setEmailError('') }}
                disabled={loadingEmail || savingEmail} placeholder="your-gmail@gmail.com" />
            </Field>
            <Field label="Gmail App Password" hint="16-character App Password (not your regular password)">
              <input type="password" value={senderPassword}
                onChange={e => { setSenderPassword(e.target.value); setEmailError('') }}
                disabled={loadingEmail || savingEmail} placeholder="xxxx xxxx xxxx xxxx" />
            </Field>
            {emailError && <ErrorBanner msg={emailError} />}
            {testEmailResult && (
              <div style={{
                background: testEmailResult.ok ? 'var(--success-light)' : 'var(--danger-light)',
                color: testEmailResult.ok ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${testEmailResult.ok ? 'var(--success)' : 'var(--danger)'}`,
                padding: '10px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                display: 'flex', gap: 8, alignItems: 'center',
              }}>
                <span>{testEmailResult.ok ? '✓' : '✗'}</span> {testEmailResult.msg}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={saveEmailSettings}
                disabled={savingEmail || loadingEmail} style={{ flex: 1 }}>
                {loadingEmail ? '📥 Loading…' : savingEmail ? '⏳ Saving…' : '💾 Save'}
              </button>
              <button className="btn btn-outline" onClick={sendTestEmail}
                disabled={testingEmail || savingEmail || loadingEmail} style={{ flex: 1 }}>
                {testingEmail ? '⏳ Sending…' : '📨 Send Test Email'}
              </button>
            </div>
          </div>
        </div>

        {/* ── SHARED THRESHOLD ────────────────────────────────────────────── */}
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>🎯 Anomaly Threshold</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 14 }}>
            Applies to all modes (Webcam, RTSP, Video Upload)
          </div>
          <Field
            label="Threshold (0.0 – 1.0)"
            hint="Stage-1 confidence needed to flag a window as anomaly"
            timing={`lower = more sensitive (more alerts)  ·  higher = stricter (fewer alerts)  ·  current: ${(anomalyThreshold * 100).toFixed(0)}%`}
          >
            <input type="number" min="0" max="1" step="0.01" value={anomalyThreshold}
              onChange={e => { setAnomalyThreshold(parseFloat(e.target.value)); setDetectionError('') }}
              disabled={loadingDetection || savingDetection} />
          </Field>
        </div>

        {/* ── VIDEO UPLOAD ─────────────────────────────────────────────────── */}
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>📁 Video Upload Detection</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 14 }}>
            Controls how uploaded video files are analyzed
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field
              label="Window Size (frames)"
              hint="How many consecutive frames form one analysis window (assumes ~30fps video)"
              timing={uploadTiming(uploadSeqLen, uploadVotingWin)}
            >
              {numInput(uploadSeqLen, setUploadSeqLen)}
            </Field>
            <Field
              label="Consecutive Windows Before Alert"
              hint="How many anomaly windows in a row before saving clip + sending email"
              timing={uploadTiming(uploadSeqLen, uploadVotingWin)}
            >
              {numInput(uploadVotingWin, setUploadVotingWin)}
            </Field>
          </div>
        </div>

        {/* ── WEBCAM ───────────────────────────────────────────────────────── */}
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>📷 Webcam Detection</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 14 }}>
            Webcam runs at 10fps with a fixed 16-frame window (1.6s) and 50% sliding overlap
          </div>
          <Field
            label="Consecutive Windows Before Alert"
            hint="Anomaly windows in a row before event is confirmed, clip saved, and email sent"
            timing={webcamTiming(webcamConsec)}
          >
            {numInput(webcamConsec, setWebcamConsec)}
          </Field>
        </div>

        {/* ── RTSP ─────────────────────────────────────────────────────────── */}
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>📡 RTSP / CCTV Detection</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 14 }}>
            Controls live IP camera / CCTV stream analysis (assumes ~30fps camera)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field
              label="Window Size (frames)"
              hint="Frames collected before each inference. Uses 50% overlap sliding window."
              timing={rtspTiming(rtspSeqLen, rtspConsec)}
            >
              {numInput(rtspSeqLen, setRtspSeqLen)}
            </Field>
            <Field
              label="Consecutive Windows Before Alert"
              hint="Anomaly windows in a row before event is confirmed, clip saved, and email sent"
              timing={rtspTiming(rtspSeqLen, rtspConsec)}
            >
              {numInput(rtspConsec, setRtspConsec)}
            </Field>
          </div>
        </div>

        {/* ── SAVE ALL DETECTION SETTINGS ─────────────────────────────────── */}
        <div className="card" style={{ paddingTop: 0, paddingBottom: 0, border: 'none', background: 'none', boxShadow: 'none' }}>
          {detectionSaved && <SavedBanner />}
          {detectionError && <ErrorBanner msg={detectionError} />}
          <button className="btn btn-primary" onClick={saveDetectionSettings}
            disabled={savingDetection || loadingDetection}
            style={{ width: '100%', marginTop: 4 }}>
            {loadingDetection ? '📥 Loading…' : savingDetection ? '⏳ Saving…' : '💾 Save Detection Settings'}
          </button>
        </div>

        {/* ── BACKEND HEALTH ───────────────────────────────────────────────── */}
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>🩺 Backend Health</h2>
          <button className="btn btn-outline" onClick={checkBackend}
            disabled={checking} style={{ marginBottom: 14 }}>
            {checking ? 'Checking…' : 'Check Now'}
          </button>
          {health && (
            health.error
              ? <div style={{ color: '#f87171', fontSize: 13 }}>✗ {health.error}</div>
              : (
                <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[
                    { label: 'Status',        val: health.status,                           ok: health.status === 'ok' },
                    { label: 'Stage-1 Model', val: health.stage1_ready ? 'Loaded' : 'Not loaded', ok: health.stage1_ready },
                    { label: 'Stage-2 Model', val: health.stage2_ready ? 'Loaded' : 'Not loaded', ok: health.stage2_ready },
                    { label: 'Device',        val: health.device,                           ok: true },
                  ].map(({ label, val, ok }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ color: ok ? '#4ade80' : '#f87171', fontWeight: 600 }}>{val}</span>
                    </div>
                  ))}
                </div>
              )
          )}
        </div>

      </div>
    </div>
  )
}
