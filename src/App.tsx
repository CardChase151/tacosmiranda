import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider, useAuth } from './context/AuthContext'
import SEO from './components/SEO'
import Header from './components/Header'
import Footer from './components/Footer'
import AdminLoginModal from './components/AdminLoginModal'
import Home from './pages/Home'
import Menu from './pages/Menu'
import NotFound from './pages/NotFound'
import PrintMenu from './pages/PrintMenu'
import Screen from './pages/Screen'
import OrderOnline from './pages/OrderOnline'
import MyOrders from './pages/MyOrders'
import AdminBilling from './pages/AdminBilling'
import AdminDashboard from './pages/AdminDashboard'
import AdminMenuData from './pages/AdminMenuData'
import AdminAnalytics from './pages/AdminAnalytics'
import AdminPins from './pages/AdminPins'
import StaffClock from './pages/StaffClock'
import './lib/trackVisit'
import { usePageViewTracker } from './lib/usePageViewTracker'
import './App.css'

function RequireRole({ role, children }: { role: 'admin' | 'owner'; children: React.ReactNode }) {
  const { isAdmin, isOwner, loading, profileLoading, user } = useAuth()
  if (loading || (user && profileLoading)) return null
  const allowed = role === 'owner' ? isOwner : isAdmin
  if (!allowed) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppContent() {
  const [showLogin, setShowLogin] = useState(false)
  const location = useLocation()
  usePageViewTracker()

  // Scroll to a hash target after navigation. Retries briefly because the
  // section only exists once the menu data has come back.
  useEffect(() => {
    if (!location.hash) return
    const id = location.hash.slice(1)
    let tries = 0
    const tick = window.setInterval(() => {
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
        window.clearInterval(tick)
      } else if (++tries > 20) {
        window.clearInterval(tick)
      }
    }, 100)
    return () => window.clearInterval(tick)
  }, [location.pathname, location.hash])
  const isPrintPage = location.pathname === '/admin/print-menu'
  const isOrderPage = location.pathname === '/order'
  const isScreenPage = location.pathname === '/screen'
  const isClockPage = location.pathname.startsWith('/clock-')
  const chromeless = isPrintPage || isScreenPage || isClockPage

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SEO />
      {!chromeless && <Header onAdminClick={() => setShowLogin(true)} />}
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/admin/print-menu" element={<RequireRole role="admin"><PrintMenu /></RequireRole>} />
          <Route path="/screen" element={<Screen />} />
          <Route path="/order" element={<OrderOnline />} />
          <Route path="/my-orders" element={<MyOrders />} />
          <Route path="/admin/billing" element={<RequireRole role="owner"><AdminBilling /></RequireRole>} />
          <Route path="/admin/dashboard" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
          <Route path="/admin/analytics" element={<RequireRole role="admin"><AdminAnalytics /></RequireRole>} />
          <Route path="/admin/menu-data" element={<RequireRole role="admin"><AdminMenuData /></RequireRole>} />
          <Route path="/admin/pins" element={<RequireRole role="admin"><AdminPins /></RequireRole>} />
          {/* Hidden staff time-clock kiosk. The trailing slug is the only thing protecting this URL — keep it out of any nav, sitemap, or link. */}
          <Route path="/clock-x9k2m7p4q3" element={<StaffClock />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!chromeless && !isOrderPage && <Footer />}
      {showLogin && <AdminLoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <HelmetProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </HelmetProvider>
  )
}
