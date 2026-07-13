import { useEffect, useState, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { getStats } from '../services/detectionService.js'
import '../styles/DashboardPage.css'

const EXPECTED_TYPES = ['Fight', 'Robbery', 'Accident']

const TYPE_COLORS = {
  Fight:    '#ef4444',
  Robbery:  '#f97316',
  Accident: '#8b5cf6',
}

function color(type) { return TYPE_COLORS[type] || '#3b82f6' }

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString()
}

/* Animated canvas background — soft drifting orbs + grid dots + particles */
function DashBg() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId

    const orbs = [
      { x: 0.12, y: 0.28, r: 300, rgb: [239, 68,  68],  vx:  0.00012, vy:  0.00018 },
      { x: 0.80, y: 0.52, r: 340, rgb: [249, 115, 22],  vx: -0.00014, vy:  0.00010 },
      { x: 0.48, y: 0.88, r: 280, rgb: [139, 92, 246],  vx:  0.00007, vy: -0.00020 },
    ]

    const particles = Array.from({ length: 28 }, () => ({
      x:     Math.random(),
      y:     Math.random(),
      size:  Math.random() * 1.3 + 0.4,
      speed: Math.random() * 0.00022 + 0.00007,
      alpha: Math.random() * 0.22 + 0.05,
    }))

    function resize() {
      const parent = canvas.parentElement
      if (!parent) return
      canvas.width  = parent.clientWidth
      canvas.height = Math.max(parent.clientHeight, 500)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement)
    resize()

    function draw() {
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)

      // Drifting color orbs
      orbs.forEach(o => {
        o.x += o.vx; o.y += o.vy
        if (o.x < -0.3 || o.x > 1.3) o.vx *= -1
        if (o.y < -0.3 || o.y > 1.3) o.vy *= -1
        const cx = o.x * W, cy = o.y * H
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, o.r)
        const [r, gv, b] = o.rgb
        g.addColorStop(0,   `rgba(${r},${gv},${b},0.09)`)
        g.addColorStop(0.5, `rgba(${r},${gv},${b},0.04)`)
        g.addColorStop(1,   `rgba(${r},${gv},${b},0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, cy, o.r, 0, Math.PI * 2)
        ctx.fill()
      })

      // Grid intersection dots
      const sp = 55
      ctx.fillStyle = 'rgba(59,130,246,0.07)'
      for (let x = sp; x < W; x += sp)
        for (let y = sp; y < H; y += sp) {
          ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill()
        }

      // Upward-drifting data particles
      particles.forEach(p => {
        p.y -= p.speed
        if (p.y < -0.02) p.y = 1.02
        ctx.globalAlpha = p.alpha
        ctx.fillStyle = '#3b82f6'
        ctx.beginPath()
        ctx.arc(p.x * W, p.y * H, p.size, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.globalAlpha = 1

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(animId); ro.disconnect() }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="dash-bg"
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  )
}

/* Smooth count-up hook */
function useCountUp(target, duration = 1100) {
  const [display, setDisplay] = useState(0)
  const rafRef  = useRef(null)
  const prevRef = useRef(0)

  useEffect(() => {
    if (target == null) return
    const from = prevRef.current
    const to   = target
    if (from === to) return

    const start = performance.now()
    const diff  = to - from

    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    function tick(now) {
      const t      = Math.min((now - start) / duration, 1)
      const eased  = 1 - Math.pow(1 - t, 3)          // ease-out cubic
      setDisplay(Math.round(from + diff * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else prevRef.current = to
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return target == null ? null : display
}

/* Individual stat card with its own count-up */
function StatCard({ label, value, cardColor, delay }) {
  const count = useCountUp(value)
  return (
    <div className={`stat-card animate-fade-up delay-${delay}`}>
      <div className="label">{label}</div>
      <div
        className="value"
        style={{
          color: cardColor,
          animation: value != null ? 'countUp 0.5s cubic-bezier(0.34,1.56,0.64,1) both' : 'none',
          animationDelay: `${delay * 0.07}s`,
        }}
      >
        {count === null ? (
          <span className="skeleton" style={{ display: 'inline-block', width: 48, height: 36, borderRadius: 6 }} />
        ) : count}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats]           = useState(null)
  const [err, setErr]               = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const s = await getStats()
        setStats(s)
        setLastUpdated(new Date())
      } catch {
        setErr('Failed to load dashboard data. Is the backend running?')
      }
    }
    load()
    const id = setInterval(load, 15_000)
    return () => clearInterval(id)
  }, [])

  const typeOrder = stats
    ? Array.from(new Set([...EXPECTED_TYPES, ...Object.keys(stats.by_type || {})]))
        .filter(type => EXPECTED_TYPES.includes(type))
    : EXPECTED_TYPES

  const chartData = stats
    ? typeOrder.map(type => ({ type, count: stats.by_type?.[type] ?? 0 }))
    : []

  const pieData = stats
    ? typeOrder.map(type => ({ name: type, value: stats.by_type?.[type] ?? 0 }))
    : []

  return (
    <div className="dashboard-page page-enter">
      {/* Animated canvas background */}
      <DashBg />
      {/* Watermark — login-page logo style */}
      <div className="dashboard-watermark" aria-hidden="true">
        <div
          className="scan-wrap animate-float"
          style={{
            display: 'inline-block',
            borderRadius: '50%',
            filter: 'drop-shadow(0 0 36px rgba(59,130,246,0.55)) drop-shadow(0 0 10px rgba(59,130,246,0.3))',
          }}
        >
          <img
            src="/LOGO.png"
            alt=""
            aria-hidden="true"
            style={{ width: 220, height: 220, objectFit: 'contain', borderRadius: '50%', display: 'block' }}
          />
        </div>
      </div>

      <div className="dashboard-header-section">
        <h1 className="page-title">Dashboard</h1>
        {lastUpdated && (
          <span className="animate-fade-in" style={{ color: 'var(--text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="live-dot" />
            Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>

      {err && (
        <div className="error-message animate-fade-up" style={{ marginBottom: 20 }}>
          <span>✗</span>
          {err}
        </div>
      )}

      {/* Stat cards — staggered entry */}
      <div className="stat-grid">
        <StatCard
          label="Total Detections"
          value={stats?.total ?? null}
          cardColor="var(--accent)"
          delay={1}
        />
        {typeOrder.map((type, i) => (
          <StatCard
            key={type}
            label={type}
            value={stats?.by_type?.[type] ?? (stats ? 0 : null)}
            cardColor={color(type)}
            delay={i + 2}
          />
        ))}
      </div>

      {/* Charts — staggered entry */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Bar chart */}
        <div className="card animate-fade-up delay-5">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Anomalies by Type</h2>
          {chartData.length === 0
            ? <div className="skeleton" style={{ height: 250, borderRadius: 10 }} />
            : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData} barSize={40}>
                  <XAxis dataKey="type" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                    cursor={{ fill: 'rgba(59,130,246,0.06)' }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {chartData.map(entry => (
                      <Cell key={entry.type} fill={color(entry.type)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>

        {/* Pie chart */}
        <div className="card animate-fade-up delay-6">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Type Distribution</h2>
          {pieData.length === 0
            ? <div className="skeleton" style={{ height: 250, borderRadius: 10 }} />
            : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={85}
                    dataKey="value"
                    animationBegin={200}
                    animationDuration={800}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={color(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )
          }
        </div>
      </div>
    </div>
  )
}
