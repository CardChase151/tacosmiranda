import { useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from './context/AuthContext'
import SEO from './components/SEO'
import Header from './components/Header'
import Footer from './components/Footer'
import EmailBanner from './components/EmailBanner'
import AdminLoginModal from './components/AdminLoginModal'
import Home from './pages/Home'
import './App.css'

function AppContent() {
  const [showLogin, setShowLogin] = useState(false)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SEO />
      <Header onAdminClick={() => setShowLogin(true)} />
      <main style={{ flex: 1 }}>
        <Home />
      </main>
      <Footer />
      <EmailBanner />
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
