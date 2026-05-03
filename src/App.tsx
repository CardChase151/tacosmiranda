import { useState } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from './context/AuthContext'
import SEO from './components/SEO'
import Header from './components/Header'
import Footer from './components/Footer'
import EmailBanner from './components/EmailBanner'
import AdminLoginModal from './components/AdminLoginModal'
import Home from './pages/Home'
import PrintMenu from './pages/PrintMenu'
import Screen from './pages/Screen'
import OrderOnline from './pages/OrderOnline'
import MyOrders from './pages/MyOrders'
import AdminBilling from './pages/AdminBilling'
import AdminDashboard from './pages/AdminDashboard'
import AdminMenuData from './pages/AdminMenuData'
import './App.css'

function AppContent() {
  const [showLogin, setShowLogin] = useState(false)
  const location = useLocation()
  const isPrintPage = location.pathname === '/admin/print-menu'
  const isOrderPage = location.pathname === '/order'
  const isScreenPage = location.pathname === '/screen'
  const chromeless = isPrintPage || isScreenPage

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SEO />
      {!chromeless && <Header onAdminClick={() => setShowLogin(true)} />}
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/print-menu" element={<PrintMenu />} />
          <Route path="/screen" element={<Screen />} />
          <Route path="/order" element={<OrderOnline />} />
          <Route path="/my-orders" element={<MyOrders />} />
          <Route path="/admin/billing" element={<AdminBilling />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/menu-data" element={<AdminMenuData />} />
        </Routes>
      </main>
      {!chromeless && !isOrderPage && <Footer />}
      {!chromeless && !isOrderPage && <EmailBanner />}
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
