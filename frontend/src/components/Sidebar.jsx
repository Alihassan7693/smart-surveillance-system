import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useSidebar } from '../context/SidebarContext.jsx'
import { useStream } from '../context/StreamContext.jsx'
import { removeWhiteBackground } from '../utils/imageUtils.js'
import { logout as logoutService, isAdmin } from '../services/authService.js'

const NAV = [
  { path: '/',        label: 'Dashboard',   icon: '📊' },
  { path: '/upload',  label: 'Upload Video', icon: '🎬' },
  { path: '/live',    label: 'Live Feed',    icon: '📷' },
  { path: '/alerts',  label: 'Alerts',       icon: '🚨' },
  { path: '/history', label: 'History',      icon: '🕒' },
  { path: '/reports', label: 'Reports',      icon: '📈' },
]

const ADMIN_NAV = [
  { path: '/admin',   label: 'Admin Panel',  icon: '👨‍💼' },
]

const style = {
  sidebar: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    width: 'var(--sidebar-w)',
    background: 'linear-gradient(180deg, var(--bg-secondary) 0%, #0f1622 100%)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    padding: '0 0 20px',
    zIndex: 100,
    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '4px 0 16px rgba(0,0,0,0.3)',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  sidebarCollapsed: {
    width: 'var(--sidebar-collapsed-w)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 8px',
    borderBottom: '1px solid var(--border)',
    marginBottom: 8,
    background: 'rgba(59,130,246,0.05)',
    minHeight: 'auto',
  },
  brand: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogo: {
    maxWidth: '100%',
    maxHeight: 60,
    objectFit: 'contain',
  },
  toggleBtn: {
    background: 'rgba(59,130,246,0.15)',
    border: '1.5px solid var(--accent)',
    cursor: 'pointer',
    borderRadius: 8,
    padding: '6px 6px',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    transition: 'all 0.3s ease',
    color: 'var(--accent)',
    flexShrink: 0,
    width: '32px',
    height: '32px',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hamburgerLine: {
    width: 16,
    height: 2,
    background: 'var(--accent)',
    borderRadius: 1,
    transition: 'all 0.3s ease',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '0 8px',
    flex: 1,
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 12px',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-muted)',
    textDecoration: 'none',
    borderRadius: 10,
    transition: 'all 0.25s ease',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    position: 'relative',
  },
  linkIcon: {
    fontSize: 18,
    flexShrink: 0,
  },
  linkLabel: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  activeLink: {
    background: 'linear-gradient(90deg, rgba(59,130,246,0.28) 0%, rgba(59,130,246,0.07) 100%)',
    color: 'var(--accent)',
    borderLeft: '3px solid var(--accent)',
    boxShadow: '0 2px 16px rgba(59,130,246,0.18)',
  },
  footer: {
    marginTop: 'auto',
    padding: '8px 8px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 12px',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-muted)',
    textDecoration: 'none',
    borderRadius: 10,
    transition: 'all 0.25s ease',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    width: '100%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  tooltip: {
    position: 'absolute',
    left: '100%',
    top: '50%',
    transform: 'translateY(-50%)',
    marginLeft: 10,
    background: 'rgba(0,0,0,0.9)',
    color: 'var(--text-primary)',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 1000,
    opacity: 0,
    transition: 'opacity 0.2s ease',
  },
}

export default function Sidebar() {
  const { isCollapsed, setIsCollapsed } = useSidebar()
  const { rtspMode } = useStream()
  const rtspLive = rtspMode !== 'idle'   // show live dot only when camera is streaming
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)
  const [logoSrc, setLogoSrc] = useState('/LOGO.png')
  const [mounted, setMounted] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    removeWhiteBackground('/LOGO.png', 190).then(setLogoSrc).catch(() => setLogoSrc('/LOGO.png'))
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  // Update mobile state on window resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, []);

  function logout() {
    logoutService()
    navigate('/login')
  }

  function toggleSidebar() {
    setIsCollapsed(!isCollapsed)
  }

  return (
    <div
      className="app-sidebar"
      style={{
        ...style.sidebar,
        ...(isCollapsed ? style.sidebarCollapsed : {}),
      }}
    >
      {/* ── Animated background layers ── */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div className="sidebar-bg-gradient" />
        <div className="sidebar-bg-grid" />
        <div className="sidebar-bg-scan" />
      </div>

      <div style={{
        ...style.header,
        position: 'relative',
        zIndex: 1,
        justifyContent: isCollapsed ? 'center' : 'space-between',
      }}>
        {!isCollapsed && (
          <div style={style.brand}>
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
                alt="Smart Surveillance Logo"
                style={{ width: 54, height: 54, objectFit: 'contain', borderRadius: '50%', display: 'block' }}
              />
            </div>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          style={{
            ...style.toggleBtn,
            ...(isCollapsed ? { marginLeft: 0 } : { marginLeft: '8px' }),
          }}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <div style={{...style.hamburgerLine, transform: isCollapsed ? 'none' : 'rotate(-45deg) translateY(5px)', width: isCollapsed ? 14 : 16}}></div>
          <div style={{...style.hamburgerLine, opacity: isCollapsed ? 1 : 0, width: 14}}></div>
          <div style={{...style.hamburgerLine, transform: isCollapsed ? 'none' : 'rotate(45deg) translateY(-5px)', width: isCollapsed ? 14 : 16}}></div>
        </button>
      </div>

      <nav style={{ ...style.nav, position: 'relative', zIndex: 1 }}>
        {NAV.filter(item => !item.adminOnly || isAdmin()).map(({ path, label, icon }, idx) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={mounted ? `sidebar-nav-link animate-slide-left delay-${idx + 1}` : 'sidebar-nav-link'}
            style={({ isActive }) => ({
              ...style.link,
              ...(isActive ? style.activeLink : {}),
            })}
            title={isCollapsed ? label : ''}
          >
            <span style={style.linkIcon}>{icon}</span>
            {!isCollapsed && (
              <span style={{ ...style.linkLabel, display: 'flex', alignItems: 'center', gap: 8 }}>
                {label}
                {path === '/live' && rtspLive && (
                  <span className="live-dot" style={{ marginLeft: 'auto' }} />
                )}
              </span>
            )}
            {isCollapsed && path === '/live' && rtspLive && (
              <span className="live-dot" style={{ position: 'absolute', top: 7, right: 7 }} />
            )}
          </NavLink>
        ))}

        {/* Admin Section */}
        {isAdmin() && (
          <>
            <div style={{ 
              height: '1px', 
              background: 'var(--border)', 
              margin: '12px 0',
              opacity: isCollapsed ? 0 : 1,
              transition: 'opacity 0.3s ease'
            }} />
            {ADMIN_NAV.map(({ path, label, icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/admin'}
                style={({ isActive }) => ({
                  ...style.link,
                  ...(isActive ? style.activeLink : {}),
                  background: isActive ? 'rgba(239,68,68,0.2)' : 'none',
                  color: isActive ? '#ef4444' : 'var(--text-muted)',
                })}
                title={isCollapsed ? label : ''}
              >
                <span style={style.linkIcon}>{icon}</span>
                {!isCollapsed && <span style={style.linkLabel}>{label}</span>}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div style={{ ...style.footer, position: 'relative', zIndex: 1 }}>
        <button
          onClick={logout}
          style={{
            ...style.logoutBtn,
            ...(isMobile ? {} : { animation: 'none' }),
          }}
          title={isCollapsed ? 'Logout' : ''}
        >
          <span style={style.linkIcon}>🚪</span>
          {!isCollapsed && <span style={style.linkLabel}>Logout</span>}
        </button>
      </div>
    </div>
  )
}

