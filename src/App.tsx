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
import './App.css'

function AppContent() {
  const [showLogin, setShowLogin] = useState(false)
  const location = useLocation()
  const isPrintPage = location.pathname === '/admin/print-menu'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SEO />
      {!isPrintPage && <Header onAdminClick={() => setShowLogin(true)} />}
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/print-menu" element={<PrintMenu />} />
        </Routes>
      </main>
      {!isPrintPage && <Footer />}
      {!isPrintPage && <EmailBanner />}
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
