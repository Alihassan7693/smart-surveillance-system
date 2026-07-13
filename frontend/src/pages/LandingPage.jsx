import { useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import '../styles/LandingPage.css'

function isLoggedIn() {
  return !!localStorage.getItem('token')
}

/* ═══════════════════════════════════════════════
   Surveillance canvas — same elements as login bg,
   contained inside the hero section (position absolute)
═══════════════════════════════════════════════ */
function HeroBg() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let W, H, animId
    let radarAngle = 0

    function resize() {
      W = canvas.width  = window.innerWidth
      H = canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    function rRect(x, y, w, h, r) {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y,     x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x,     y + h, r)
      ctx.arcTo(x,     y + h, x,     y,     r)
      ctx.arcTo(x,     y,     x + w, y,     r)
      ctx.closePath()
    }

    const PTS = Array.from({ length: 60 }, () => ({
      x:  Math.random() * window.innerWidth,
      y:  Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.32,
      vy: (Math.random() - 0.5) * 0.32,
      r:  Math.random() * 1.6 + 0.5,
    }))

    const CAMS = Array.from({ length: 10 }, () => ({
      x:   Math.random() * window.innerWidth,
      y:   Math.random() * window.innerHeight,
      t:   Math.random() * Math.PI * 2,
      spd: 0.007 + Math.random() * 0.007,
      sz:  20 + Math.random() * 18,
    }))

    function drawCam(x, y, sz, alpha) {
      ctx.save()
      ctx.translate(x, y)
      ctx.strokeStyle = `rgba(59,130,246,${alpha})`
      ctx.fillStyle   = `rgba(59,130,246,${alpha * 0.55})`
      ctx.lineWidth   = 1
      const bw = sz * 0.62, bh = sz * 0.42
      rRect(-bw / 2, -bh / 2, bw, bh, 3); ctx.stroke()
      ctx.beginPath(); ctx.arc(0, 0, sz * 0.15, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(0, 0, sz * 0.06, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath()
      ctx.moveTo(bw / 2, -bh * 0.3); ctx.lineTo(bw / 2 + sz * 0.3, -sz * 0.3)
      ctx.lineTo(bw / 2 + sz * 0.3,  sz * 0.3); ctx.lineTo(bw / 2, bh * 0.3)
      ctx.stroke()
      ctx.restore()
    }

    function drawRadar(cx, cy, R) {
      ctx.lineWidth = 1
      for (let i = 1; i <= 3; i++) {
        ctx.strokeStyle = `rgba(59,130,246,${0.12 * i})`
        ctx.beginPath(); ctx.arc(cx, cy, R * (i / 3), 0, Math.PI * 2); ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(59,130,246,0.15)'
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke()
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(radarAngle)
      const sg = ctx.createLinearGradient(0, 0, R, 0)
      sg.addColorStop(0, 'rgba(59,130,246,0.45)')
      sg.addColorStop(1, 'rgba(59,130,246,0)')
      ctx.fillStyle = sg
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -0.4, 0); ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgba(59,130,246,0.9)'
      ctx.beginPath(); ctx.arc(R * 0.5, 0, 2.5, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }

    function draw() {
      ctx.fillStyle = '#070b1f'
      ctx.fillRect(0, 0, W, H)

      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85)
      vig.addColorStop(0, 'rgba(0,0,0,0)')
      vig.addColorStop(1, 'rgba(0,0,0,0.65)')
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H)

      ctx.strokeStyle = 'rgba(59,130,246,0.035)'
      ctx.lineWidth = 1
      for (let x = 0; x < W; x += 68) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
      for (let y = 0; y < H; y += 68) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

      drawRadar(W * 0.1,  H * 0.85, W * 0.21)
      drawRadar(W * 0.88, H * 0.12, W * 0.12)
      radarAngle += 0.009

      PTS.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > W) p.vx *= -1
        if (p.y < 0 || p.y > H) p.vy *= -1
        ctx.fillStyle = 'rgba(59,130,246,0.45)'
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
        PTS.forEach(q => {
          const d = Math.hypot(p.x - q.x, p.y - q.y)
          if (d < 95 && d > 0) {
            ctx.strokeStyle = `rgba(59,130,246,${0.15 * (1 - d / 95)})`
            ctx.lineWidth = 0.5
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke()
          }
        })
      })

      CAMS.forEach(c => {
        c.t += c.spd
        drawCam(c.x, c.y, c.sz, 0.08 + 0.05 * Math.sin(c.t))
      })

      const BK = 28, BL = 5
      const corners = [[20, 20], [W - 20, 20], [20, H - 20], [W - 20, H - 20]]
      ctx.strokeStyle = 'rgba(59,130,246,0.5)'; ctx.lineWidth = 2
      corners.forEach(([cx, cy]) => {
        const sx = cx < W / 2 ? 1 : -1, sy = cy < H / 2 ? 1 : -1
        ctx.beginPath()
        ctx.moveTo(cx + sx * BK, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * BK)
        ctx.stroke()
        ctx.fillStyle = 'rgba(59,130,246,0.8)'
        ctx.beginPath(); ctx.arc(cx, cy, BL, 0, Math.PI * 2); ctx.fill()
      })

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, display: 'block' }}
    />
  )
}

/* ─── Data ───────────────────────────────────────────────────────────── */

const FEATURES = [
  { icon: '🎥', title: 'Real-Time Monitoring',    desc: 'Continuously analyzes live CCTV, webcam, and RTSP IP camera streams using a two-stage AI pipeline — 24 hours a day, 7 days a week.' },
  { icon: '🧠', title: 'AI Threat Detection',     desc: 'Deep learning models (CNN + ConvLSTM autoencoder) detect deviations from normal behavior with high sensitivity and low false-alarm rates.' },
  { icon: '🚨', title: 'Instant Alerts',          desc: 'Automated email notifications are dispatched the moment a threat is confirmed, with an annotated video clip attached for review.' },
  { icon: '📊', title: 'Analytics Dashboard',     desc: 'Interactive bar/pie charts, incident history table, and monthly PDF reports give complete visibility into all security events.' },
  { icon: '📡', title: 'Multi-Source Input',      desc: 'Accepts webcam feeds, RTSP URLs for IP cameras, and uploaded recorded video files — flexible for any surveillance environment.' },
  { icon: '🔒', title: 'Role-Based Access',       desc: 'Separate Admin and Security Personnel roles with JWT authentication ensure every user sees exactly what they need.' },
]

const STEPS = [
  { num: 1, icon: '📷', title: 'Connect Camera',  desc: 'Plug in a webcam, provide an RTSP URL for a CCTV/IP camera, or upload a recorded video file for batch analysis.' },
  { num: 2, icon: '🤖', title: 'AI Analysis',     desc: 'Stage-1 ConvLSTM detects anomalies. Stage-2 CNN classifies the threat type — Fight, Robbery, or Accident.' },
  { num: 3, icon: '🔔', title: 'Alert & Record',  desc: 'The incident clip is saved to cloud storage, an email alert is dispatched, and the event is logged to the dashboard.' },
]

const STATS = [
  { value: '3',     suffix: '',  label: 'Threat Types Detected' },
  { value: '2',     suffix: '-Stage', label: 'AI Detection Pipeline' },
  { value: '24/7',  suffix: '',  label: 'Continuous Monitoring' },
  { value: '< 2s',  suffix: '',  label: 'Alert Response Time' },
]

const TECH = [
  { name: 'PyTorch',    color: '#ee4c2c' },
  { name: 'FastAPI',    color: '#009485' },
  { name: 'React',      color: '#61dafb' },
  { name: 'Firebase',   color: '#ffca28' },
  { name: 'OpenCV',     color: '#5c8a1e' },
  { name: 'Cloudinary', color: '#3448c5' },
  { name: 'Python',     color: '#3776ab' },
  { name: 'WebSocket',  color: '#8b5cf6' },
]

const TEAM = [
  { name: 'Saim Sajjad', id: '22121519-031', avatar: '👨‍💻' },
  { name: 'Ali Hassan',  id: '22121519-030', avatar: '👨‍💻' },
  { name: 'Umer Akbar',  id: '22121519-035', avatar: '👨‍💻' },
]

/* ─── Main Component ─────────────────────────────────────────────────── */

export default function LandingPage() {
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoggedIn()) navigate('/', { replace: true })
  }, [navigate])

  return (
    <div style={{ background: '#070b1f', color: '#e2e8f0', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── Fixed Nav ─────────────────────────────────────────────────── */}
      <nav className="land-nav animate-fade-in">
        <div className="land-nav-brand">
          <img src="/LOGO.png" alt="Logo" className="land-nav-logo" />
          <span className="land-nav-title">
            Smart <span>Surveillance</span>
          </span>
        </div>
        <Link to="/login" className="land-login-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Login
          <span className="btn-arrow">→</span>
        </Link>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <HeroBg />

        {/* HUD corners */}
        <div style={{ position: 'absolute', top: 76, left: 24, zIndex: 1, display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.7)', fontFamily: 'monospace', letterSpacing: 1 }}>
          <span className="live-dot" />
          SYSTEM ACTIVE
        </div>
        <div style={{ position: 'absolute', top: 76, right: 24, zIndex: 1, fontSize: 11, color: 'rgba(148,163,184,0.55)', fontFamily: 'monospace' }}>
          SMART SURVEILLANCE v2.0
        </div>

        {/* Hero content */}
        <div style={{ position: 'relative', zIndex: 1, padding: '0 20px', maxWidth: 720 }}>

          {/* Logo */}
          <div className="animate-fade-in" style={{ marginBottom: 28 }}>
            <div
              className="scan-wrap animate-float"
              style={{ display: 'inline-block', borderRadius: '50%', filter: 'drop-shadow(0 0 36px rgba(59,130,246,0.55)) drop-shadow(0 0 10px rgba(59,130,246,0.3))' }}
            >
              <img src="/LOGO.png" alt="Smart Surveillance" style={{ width: 130, height: 130, objectFit: 'contain', borderRadius: '50%', display: 'block' }} />
            </div>
          </div>

          <div className="animate-fade-up delay-1" style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16, fontFamily: 'monospace' }}>
            Final Year Project · BS-CS 2022–2026
          </div>

          <h1 className="animate-fade-up delay-2" style={{ fontSize: 'clamp(28px, 5.5vw, 52px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 18, color: '#f1f5f9' }}>
            Smart Surveillance System<br />
            <span style={{ color: 'var(--accent)' }}>for Real-Time Threat Detection</span>
          </h1>

          <p className="animate-fade-up delay-3" style={{ fontSize: 16, color: 'rgba(148,163,184,0.85)', lineHeight: 1.7, marginBottom: 36, maxWidth: 580, margin: '0 auto 36px' }}>
            An AI-powered CCTV analysis platform that automatically detects fights, robberies, and accidents in live video feeds — then alerts security teams instantly.
          </p>

          <div className="animate-fade-up delay-4" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/login" className="land-hero-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Access System
              <span className="btn-arrow">→</span>
            </Link>
            <a
              href="#features"
              className="btn btn-outline"
              style={{ padding: '13px 32px', fontSize: 15, fontWeight: 700, borderRadius: 10 }}
              onClick={e => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }) }}
            >
              Explore Features
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="land-scroll-indicator" style={{ position: 'absolute', bottom: 32, zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'rgba(148,163,184,0.5)', fontSize: 11, fontFamily: 'monospace', letterSpacing: 1 }}>
          <span>SCROLL</span>
          <svg width="16" height="20" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 1v14M2 9l6 6 6-6" stroke="rgba(59,130,246,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <section id="features" style={{ background: 'rgba(15,22,34,0.95)', borderTop: '1px solid rgba(59,130,246,0.1)' }}>
        <div className="land-section">
          <span className="land-section-label animate-fade-up">Core Capabilities</span>
          <h2 className="land-section-title animate-fade-up delay-1">Everything you need to protect your space</h2>
          <p className="land-section-sub animate-fade-up delay-2">
            From live camera feeds to automated alerts, the system handles every step of the threat detection pipeline automatically.
          </p>

          <div className="land-features-grid">
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`land-feature-card animate-fade-up delay-${Math.min(i + 1, 8)}`}>
                <span className="land-feature-icon">{f.icon}</span>
                <div className="land-feature-title">{f.title}</div>
                <div className="land-feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────── */}
      <section style={{ background: '#070b1f', borderTop: '1px solid rgba(59,130,246,0.08)' }}>
        <div className="land-section">
          <span className="land-section-label animate-fade-up">How It Works</span>
          <h2 className="land-section-title animate-fade-up delay-1">From camera to alert in seconds</h2>
          <p className="land-section-sub animate-fade-up delay-2">
            A three-stage pipeline takes raw video input through AI analysis and delivers a confirmed alert with a saved clip.
          </p>

          <div className="land-steps">
            {STEPS.map((s, i) => (
              <div key={s.title} className={`land-step animate-fade-up delay-${i + 2}`}>
                <div className="land-step-bubble">
                  <span>{s.icon}</span>
                  <span className="land-step-num">{s.num}</span>
                </div>
                <div className="land-step-title">{s.title}</div>
                <p className="land-step-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────────── */}
      <section className="land-stats-bg">
        <div className="land-section" style={{ paddingTop: 64, paddingBottom: 64 }}>
          <div className="land-stats-grid">
            {STATS.map((s, i) => (
              <div key={s.label} className={`animate-fade-up delay-${i + 1}`} style={{ padding: '20px 0' }}>
                <div className="land-stat-value">
                  {s.value}<span style={{ fontSize: 22, fontWeight: 700 }}>{s.suffix}</span>
                </div>
                <div className="land-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech Stack ────────────────────────────────────────────────── */}
      <section style={{ background: 'rgba(15,22,34,0.95)', borderTop: '1px solid rgba(59,130,246,0.08)' }}>
        <div className="land-section">
          <span className="land-section-label animate-fade-up">Built With</span>
          <h2 className="land-section-title animate-fade-up delay-1">Technology Stack</h2>
          <p className="land-section-sub animate-fade-up delay-2">
            Industry-standard tools selected for performance, reliability, and real-time AI inference.
          </p>

          <div className="land-tech-grid animate-fade-up delay-3">
            {TECH.map(t => (
              <div
                key={t.name}
                className="land-tech-badge"
                style={{
                  color: t.color,
                  background: t.color + '14',
                  borderColor: t.color + '40',
                }}
              >
                <span className="land-tech-dot" style={{ background: t.color }} />
                {t.name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Team ──────────────────────────────────────────────────────── */}
      <section style={{ background: '#070b1f', borderTop: '1px solid rgba(59,130,246,0.08)' }}>
        <div className="land-section">
          <span className="land-section-label animate-fade-up">The Team</span>
          <h2 className="land-section-title animate-fade-up delay-1">Developed by</h2>
          <p className="land-section-sub animate-fade-up delay-2">
            Department of Computer Science, Faculty of Computing &amp; IT — University of Gujrat
          </p>

          <div className="land-team-grid">
            {TEAM.map((m, i) => (
              <div key={m.name} className={`land-team-card animate-fade-up delay-${i + 2}`}>
                <div className="land-team-avatar">{m.avatar}</div>
                <div className="land-team-name">{m.name}</div>
                <div className="land-team-id">{m.id}</div>
                <div className="land-team-role">BS Computer Science</div>
              </div>
            ))}
          </div>

          {/* Supervisor */}
          <div className="land-supervisor-card animate-fade-up delay-5">
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(59,130,246,0.18)', border: '2px solid rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
              👨‍🏫
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>Project Supervisor</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>Mr. Zain Ul Abedin</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Department of Computer Science</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="land-footer">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/LOGO.png" alt="" style={{ width: 32, height: 32, borderRadius: '50%', filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.4))' }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: '#e2e8f0' }}>Smart Surveillance System</span>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.6)', textAlign: 'center', maxWidth: 480, lineHeight: 1.7 }}>
            Real-Time Threat Detection · Session BS-CS 2022–2026<br />
            Department of Computer Science · University of Gujrat
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <Link to="/login" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              Login to System →
            </Link>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(148,163,184,0.4)' }}>
            © 2026 · Supervised by Mr. Zain Ul Abedin
          </div>
        </div>
      </footer>

    </div>
  )
}
