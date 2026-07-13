import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar       from './components/Sidebar.jsx'
import LoginPage     from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import UploadPage    from './pages/UploadPage.jsx'
import LiveFeedPage  from './pages/LiveFeedPage.jsx'
import HistoryPage   from './pages/HistoryPage.jsx'
import AdminPage     from './pages/AdminPage.jsx'
import AlertsPage    from './pages/AlertsPage.jsx'
import ReportsPage   from './pages/ReportsPage.jsx'
import SettingsPage  from './pages/SettingsPage.jsx'
import LandingPage   from './pages/LandingPage.jsx'
import { SidebarProvider, useSidebar } from './context/SidebarContext.jsx'
import { StreamProvider } from './context/StreamContext.jsx'

function isAuthenticated() {
  return !!localStorage.getItem('token')
}

function PrivateRoute({ children, requiredRole = null }) {
  if (!isAuthenticated()) {
    return <Navigate to="/landing" replace />
  }
  
  if (requiredRole) {
    const userRole = localStorage.getItem('userRole')
    if (userRole !== requiredRole) {
      return <Navigate to="/" replace />
    }
  }
  
  return children
}

function Layout({ children }) {
  const { isCollapsed } = useSidebar()
  
  return (
    <div className="app-layout">
      <Sidebar />
      <main 
        className="main-content"
        style={{
          paddingLeft: `calc(40px + ${isCollapsed ? 'var(--sidebar-collapsed-w)' : 'var(--sidebar-w)'})`,
        }}
      >
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <SidebarProvider>
      <StreamProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/login"   element={<LoginPage />} />

          {/* User Dashboard */}
          <Route path="/" element={
            <PrivateRoute><Layout><DashboardPage /></Layout></PrivateRoute>
          } />
          
          {/* Video Upload */}
          <Route path="/upload" element={
            <PrivateRoute><Layout><UploadPage /></Layout></PrivateRoute>
          } />
          
          {/* Live Feed */}
          <Route path="/live" element={
            <PrivateRoute><Layout><LiveFeedPage /></Layout></PrivateRoute>
          } />
          
          {/* Alerts & Incidents */}
          <Route path="/alerts" element={
            <PrivateRoute><Layout><AlertsPage /></Layout></PrivateRoute>
          } />

          {/* Historical Data */}
          <Route path="/history" element={
            <PrivateRoute><Layout><HistoryPage /></Layout></PrivateRoute>
          } />
          
          {/* Monthly Reports */}
          <Route path="/reports" element={
            <PrivateRoute><Layout><ReportsPage /></Layout></PrivateRoute>
          } />
          
          {/* Admin Panel - Admin Only */}
          <Route path="/admin" element={
            <PrivateRoute requiredRole="admin">
              <Layout><AdminPage /></Layout>
            </PrivateRoute>
          } />

          {/* Settings */}
          <Route path="/settings" element={
            <PrivateRoute><Layout><SettingsPage /></Layout></PrivateRoute>
          } />

          {/* Catch-all → landing for guests, dashboard for authenticated */}
          <Route path="*" element={<Navigate to="/landing" replace />} />
        </Routes>
      </BrowserRouter>
      </StreamProvider>
    </SidebarProvider>
  )
}

