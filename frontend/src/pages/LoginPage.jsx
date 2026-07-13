import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../services/authService.js'

/* ═══════════════════════════════════════════════════════
   Animated surveillance canvas background
═══════════════════════════════════════════════════════ */
function SurveillanceBg() {
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

    /* Helper: rounded rect (safe cross-browser) */
    function rRect(x, y, w, h, r) {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y,     x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x,     y + h, r)
      ctx.arcTo(x,     y + h, x,     y,     r)
      ctx.arcTo(x,     y,     x + w, y,     r)
      ctx.closePath()
    }

    /* Particles — surveillance node network */
    const PTS = Array.from({ length: 60 }, () => ({
      x:  Math.random() * window.innerWidth,
      y:  Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.32,
      vy: (Math.random() - 0.5) * 0.32,
      r:  Math.random() * 1.6 + 0.5,
    }))

    /* Static CCTV camera silhouettes */
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
      // Body
      const bw = sz * 0.62, bh = sz * 0.42
      rRect(-bw / 2, -bh / 2, bw, bh, 3)
      ctx.stroke()
      // Lens outer
      ctx.beginPath(); ctx.arc(0, 0, sz * 0.15, 0, Math.PI * 2); ctx.stroke()
      // Lens inner
      ctx.beginPath(); ctx.arc(0, 0, sz * 0.06, 0, Math.PI * 2); ctx.fill()
      // Tail fins
      ctx.beginPath()
      ctx.moveTo(bw / 2,              -bh * 0.3)
      ctx.lineTo(bw / 2 + sz * 0.3,  -sz * 0.3)
      ctx.lineTo(bw / 2 + sz * 0.3,   sz * 0.3)
      ctx.lineTo(bw / 2,               bh * 0.3)
      ctx.stroke()
      ctx.restore()
    }

    function drawRadar(cx, cy, R) {
      // Outer ring
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(59,130,246,0.14)'; ctx.stroke()
      // Inner rings
      ;[0.66, 0.33].forEach(f => {
        ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(59,130,246,0.07)'; ctx.stroke()
      })
      // Cross-hair lines
      ctx.strokeStyle = 'rgba(59,130,246,0.07)'
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke()

      // Rotating sweep
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(radarAngle)
      // Fading wedge trail
      const steps = 30
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 0.65
        const alpha = ((steps - i) / steps) * 0.18
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, R, -a - (Math.PI * 0.65 / steps), -a)
        ctx.fillStyle = `rgba(59,130,246,${alpha})`
        ctx.fill()
      }
      // Sweep line
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R, 0)
      ctx.strokeStyle = 'rgba(59,130,246,0.8)'
      ctx.lineWidth = 1.5; ctx.stroke()
      // Blip
      const blipDist = R * 0.58
      ctx.beginPath(); ctx.arc(blipDist, 0, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = '#60a5fa'; ctx.fill()
      ctx.restore()
    }

    function drawCornerBrackets() {
      const S = 22, G = 10
      ctx.strokeStyle = 'rgba(59,130,246,0.22)'
      ctx.lineWidth = 1.5
      const corners = [
        [[G, G + S], [G, G], [G + S, G]],
        [[W - G - S, G], [W - G, G], [W - G, G + S]],
        [[G, H - G - S], [G, H - G], [G + S, H - G]],
        [[W - G - S, H - G], [W - G, H - G], [W - G, H - G - S]],
      ]
      corners.forEach(pts => {
        ctx.beginPath()
        ctx.moveTo(pts[0][0], pts[0][1])
        ctx.lineTo(pts[1][0], pts[1][1])
        ctx.lineTo(pts[2][0], pts[2][1])
        ctx.stroke()
      })
    }

    function draw() {
      ctx.clearRect(0, 0, W, H)

      /* Solid dark background */
      ctx.fillStyle = '#070b1f'
      ctx.fillRect(0, 0, W, H)

      /* Vignette overlay */
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.05, W / 2, H / 2, H * 0.9)
      vig.addColorStop(0, 'rgba(0,0,0,0)')
      vig.addColorStop(1, 'rgba(0,0,0,0.65)')
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H)

      /* Grid */
      const GRID = 68
      ctx.lineWidth = 1
      for (let x = 0; x <= W; x += GRID) {
        ctx.strokeStyle = 'rgba(59,130,246,0.045)'
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      }
      for (let y = 0; y <= H; y += GRID) {
        ctx.strokeStyle = 'rgba(59,130,246,0.045)'
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      }

      /* Radars */
      drawRadar(W * 0.09,  H * 0.84, Math.min(W, H) * 0.21)
      drawRadar(W * 0.91,  H * 0.13, Math.min(W, H) * 0.12)

      radarAngle += 0.009

      /* CCTV silhouettes */
      CAMS.forEach(cam => {
        cam.t += cam.spd
        drawCam(cam.x, cam.y, cam.sz, 0.055 + Math.sin(cam.t) * 0.03)
      })

      /* Particle connections */
      for (let i = 0; i < PTS.length; i++) {
        for (let j = i + 1; j < PTS.length; j++) {
          const dx = PTS[i].x - PTS[j].x
          const dy = PTS[i].y - PTS[j].y
          const d  = Math.hypot(dx, dy)
          if (d < 135) {
            ctx.beginPath()
            ctx.moveTo(PTS[i].x, PTS[i].y)
            ctx.lineTo(PTS[j].x, PTS[j].y)
            ctx.strokeStyle = `rgba(59,130,246,${(1 - d / 135) * 0.22})`
            ctx.lineWidth = 0.6
            ctx.stroke()
          }
        }
      }

      /* Particles */
      PTS.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > W) p.vx *= -1
        if (p.y < 0 || p.y > H) p.vy *= -1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(59,130,246,0.55)'
        ctx.fill()
      })

      /* Corner brackets */
      drawCornerBrackets()

      animId = requestAnimationFrame(draw)
    }

    draw()
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
    />
  )
}

/* ═══════════════════════════════════════════════════════
   Role definitions
═══════════════════════════════════════════════════════ */
const ROLES = [
  {
    id: 'admin',
    label: 'Admin',
    subtitle: 'System Administrator',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2z"/>
        <path d="M12 14c-6 0-9 2.5-9 4v1h18v-1c0-1.5-3-4-9-4z"/>
        <path d="M17 8l1.5 1.5L22 6"/>
      </svg>
    ),
    color: '#3b82f6',
    placeholder: 'admin',
    hint: 'Full system control & configuration',
  },
  {
    id: 'security_personnel',
    label: 'Security Personnel',
    subtitle: 'Security Officer',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L3 7v6c0 5 4 9.3 9 10.5C17 22.3 21 18 21 13V7L12 2z"/>
        <polyline points="9 12 11 14 15 10"/>
      </svg>
    ),
    color: '#8b5cf6',
    placeholder: 'security.officer',
    hint: 'Monitor feeds, alerts & incidents',
  },
]

/* ═══════════════════════════════════════════════════════
   Login Page
═══════════════════════════════════════════════════════ */
export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState('')
  const [username, setUsername]         = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]               = useState('')
  const [loading, setLoading]           = useState(false)
  const navigate = useNavigate()

  const activeRole   = ROLES.find(r => r.id === selectedRole)
  const accentColor  = activeRole?.color || '#3b82f6'

  function selectRole(id) { setSelectedRole(id); setError('') }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedRole) { setError('Please select your role first'); return }
    setError(''); setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      const msg = err.response?.data?.detail || err.message
      setError(msg === 'Network Error' ? 'Cannot reach backend server' : msg || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>

      {/* Animated canvas background */}
      <SurveillanceBg />

      {/* HUD overlays */}
      <div style={{
        position: 'fixed', top: 16, left: 16, zIndex: 1,
        fontSize: 10, fontWeight: 700, letterSpacing: 1.8,
        color: 'rgba(16,185,129,0.65)', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: 'monospace',
      }}>
        <span className="live-dot" style={{ width: 6, height: 6 }} />
        System Active
      </div>

      <div style={{
        position: 'fixed', bottom: 14, left: 16, zIndex: 1,
        fontSize: 9, letterSpacing: 1.6,
        color: 'rgba(59,130,246,0.38)', textTransform: 'uppercase',
        fontFamily: 'monospace',
      }}>
        Secure Feed · End-to-End Encrypted
      </div>

      <div style={{
        position: 'fixed', bottom: 14, right: 16, zIndex: 1,
        fontSize: 9, letterSpacing: 1.4,
        color: 'rgba(59,130,246,0.35)', fontFamily: 'monospace',
      }}>
        Smart Surveillance v2.0
      </div>

      {/* Centered login content */}
      <div style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px 16px',
      }}>
        <div style={{ width: 420, maxWidth: '100%' }}>

          {/* Logo — floating + scan sweep */}
          <div className="animate-fade-in" style={{ textAlign: 'center', marginBottom: 28 }}>
            <div
              className="scan-wrap animate-float"
              style={{
                display: 'inline-block',
                borderRadius: '50%',
                filter: 'drop-shadow(0 0 28px rgba(59,130,246,0.5)) drop-shadow(0 0 8px rgba(59,130,246,0.3))',
              }}
            >
              <img
                src="/LOGO.png"
                alt="Smart Surveillance"
                style={{ width: 156, height: 156, objectFit: 'contain', borderRadius: '50%', display: 'block' }}
              />
            </div>
          </div>

          {/* Role prompt */}
          <p className="animate-fade-up delay-1" style={{
            textAlign: 'center', fontSize: 11, color: 'rgba(148,163,184,0.8)',
            marginBottom: 14, fontWeight: 600, letterSpacing: 1.8,
            textTransform: 'uppercase', fontFamily: 'monospace',
          }}>
            ── Select Access Level ──
          </p>

          {/* Role cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {ROLES.map((role, i) => {
              const active = selectedRole === role.id
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => selectRole(role.id)}
                  className={`animate-scale-in delay-${i + 2}`}
                  style={{
                    padding: '18px 10px 14px',
                    borderRadius: 12,
                    border: `1.5px solid ${active ? role.color : 'rgba(59,130,246,0.15)'}`,
                    background: active ? `${role.color}20` : 'rgba(7,11,31,0.75)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                    transition: 'all 0.28s ease',
                    boxShadow: active
                      ? `0 0 0 1px ${role.color}40, 0 8px 24px ${role.color}25, inset 0 1px 0 ${role.color}20`
                      : '0 2px 8px rgba(0,0,0,0.4)',
                    transform: active ? 'translateY(-3px)' : 'none',
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  {/* Active dot */}
                  {active && <span className="alert-dot" style={{ position: 'absolute', top: 8, right: 9, background: role.color }} />}
                  {/* Shimmer */}
                  {active && (
                    <span style={{
                      position: 'absolute', inset: 0,
                      background: `linear-gradient(135deg, transparent 25%, ${role.color}12 50%, transparent 75%)`,
                      backgroundSize: '200% 200%',
                      animation: 'shimmer 2.5s ease infinite',
                      borderRadius: 12, pointerEvents: 'none',
                    }} />
                  )}
                  <span style={{ color: active ? role.color : 'rgba(148,163,184,0.6)', transition: 'color 0.28s ease' }}>
                    {role.icon}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: active ? role.color : '#cbd5e1', transition: 'color 0.28s ease' }}>
                    {role.label}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.55)', textAlign: 'center', lineHeight: 1.5, letterSpacing: 0.2 }}>
                    {role.hint}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Hint — shown only when no role selected */}
          {!selectedRole && (
            <div className="animate-fade-in" style={{
              textAlign: 'center', marginTop: 8, padding: '18px 0',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                border: '1.5px dashed rgba(59,130,246,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, animation: 'float 3s ease-in-out infinite',
              }}>
                🔐
              </div>
              <p style={{
                fontSize: 12, color: 'rgba(148,163,184,0.6)',
                fontFamily: 'monospace', letterSpacing: 1.2, textTransform: 'uppercase',
              }}>
                Select a role above to unlock login
              </p>
            </div>
          )}

          {/* Login card — only visible after a role is selected */}
          {selectedRole && (
          <div
            className="animate-fade-up"
            style={{
              borderRadius: 14,
              border: `1px solid ${accentColor}35`,
              borderTop: `2px solid ${accentColor}`,
              background: 'rgba(7,11,31,0.82)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              padding: 24,
              boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.08), inset 0 1px 0 rgba(255,255,255,0.04)`,
            }}
          >
            {/* "Signing in as" banner */}
            <div className="animate-fade-in" style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
              padding: '7px 12px',
              background: `${accentColor}14`,
              borderRadius: 8,
              border: `1px solid ${accentColor}28`,
            }}>
              <span style={{ color: accentColor, display: 'inline-flex' }}>{activeRole?.icon}</span>
              <span style={{ fontSize: 12, color: accentColor, fontWeight: 600, letterSpacing: 0.3 }}>
                Signing in as {activeRole?.label}
              </span>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(148,163,184,0.8)', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: 0.4 }}>
                  USERNAME
                </label>
                <input
                  type="text" value={username}
                  onChange={e => { setUsername(e.target.value); setError('') }}
                  placeholder={activeRole?.placeholder || 'Enter username'}
                  required autoComplete="username"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'rgba(148,163,184,0.8)', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: 0.4 }}>
                  PASSWORD
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    placeholder="••••••••"
                    required autoComplete="current-password"
                    style={{ background: 'rgba(255,255,255,0.04)', paddingRight: 42, width: '100%' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: 'rgba(148,163,184,0.6)', display: 'flex', alignItems: 'center',
                      transition: 'color 0.2s ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(148,163,184,0.6)'}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="error-message animate-fade-in">
                  <span>✗</span>{error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{
                  marginTop: 4, width: '100%',
                  background: `linear-gradient(135deg, ${accentColor}, ${accentColor}bb)`,
                  boxShadow: `0 4px 20px ${accentColor}40`,
                  letterSpacing: 0.5,
                }}
              >
                {loading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span className="animate-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} />
                    Authenticating…
                  </span>
                ) : `Sign In${activeRole ? ` as ${activeRole.label}` : ''}`}
              </button>
            </form>
          </div>
          )}

          {/* Footer note */}
          <p className="animate-fade-up delay-5" style={{
            textAlign: 'center', fontSize: 10, color: 'rgba(148,163,184,0.35)',
            marginTop: 16, letterSpacing: 1, fontFamily: 'monospace', textTransform: 'uppercase',
          }}>
            Authorized Access Only · All Activity Monitored
          </p>

        </div>
      </div>
    </div>
  )
}
