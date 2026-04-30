import { useState, useEffect } from 'react'
import { Lock, LogOut, Printer, CreditCard, BarChart3, Menu as MenuIcon, X, ShoppingBag, Receipt } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface HeaderProps {
  onAdminClick: () => void
}

const MOBILE_BREAKPOINT = 768

export default function Header({ onAdminClick }: HeaderProps) {
  const { isAdmin, isOwner, user, signOut } = useAuth()
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  )
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (!mobile) setDrawerOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (drawerOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [drawerOpen])

  const navTextStyle: React.CSSProperties = {
    color: 'var(--gray)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: 1,
    textTransform: 'uppercase',
    transition: 'color 0.2s',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  }

  const scrollToSection = (id: string) => {
    setDrawerOpen(false)
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const handleSignOut = () => {
    setDrawerOpen(false)
    signOut()
  }

  // ---------- DESKTOP LAYOUT ----------
  if (!isMobile) {
    return (
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}>
        <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo-white-transparent.png" alt="Tacos Miranda" style={{ height: 40 }} />
        </a>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <button
            onClick={() => scrollToSection('menu')}
            style={navTextStyle}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--gold)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--gray)'}
          >
            Menu
          </button>
          <button
            onClick={() => scrollToSection('location')}
            style={navTextStyle}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--gold)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--gray)'}
          >
            Location
          </button>
          {isAdmin && (
            <>
              <a
                href="/order"
                style={{ ...navTextStyle, color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Order Online
              </a>
              <a
                href="/my-orders"
                style={{ ...navTextStyle, color: '#60a5fa', textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.color = '#93c5fd'}
                onMouseLeave={e => e.currentTarget.style.color = '#60a5fa'}
              >
                My Orders
              </a>
              <a
                href="/admin/dashboard"
                style={{ ...navTextStyle, color: '#a78bfa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.color = '#c4b5fd'}
                onMouseLeave={e => e.currentTarget.style.color = '#a78bfa'}
              >
                <BarChart3 size={14} /> Dashboard
              </a>
            </>
          )}
          {isOwner && (
            <a
              href="/admin/billing"
              style={{ ...navTextStyle, color: '#34d399', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => e.currentTarget.style.color = '#6ee7b7'}
              onMouseLeave={e => e.currentTarget.style.color = '#34d399'}
            >
              <CreditCard size={14} /> Billing
            </a>
          )}

          {isAdmin ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <a
                href="/admin/print-menu"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: 'var(--gold)', opacity: 0.7, letterSpacing: 0.5,
                  textDecoration: 'none', transition: 'opacity 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
              >
                <Printer size={14} /> Print Menu
              </a>
              <span style={{ fontSize: 12, color: 'var(--gold)', opacity: 0.7, letterSpacing: 0.5 }}>
                Logged in as {user?.email?.split('@')[0] || 'Admin'}
              </span>
              <button
                onClick={handleSignOut}
                style={{
                  background: 'none', border: 'none', color: 'var(--gold)', opacity: 0.6,
                  transition: 'opacity 0.2s', padding: 4, display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
                title="Sign Out"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={onAdminClick}
              style={{
                background: 'none', border: 'none', color: 'var(--gray)', opacity: 0.3,
                transition: 'opacity 0.2s', padding: 4, display: 'flex', alignItems: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.6')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.3')}
              title="Admin"
            >
              <Lock size={16} />
            </button>
          )}
        </nav>
      </header>
    )
  }

  // ---------- MOBILE LAYOUT ----------
  return (
    <>
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}>
        <a href="#top" style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/logo-white-transparent.png" alt="Tacos Miranda" style={{ height: 36 }} />
        </a>

        <button
          onClick={() => setDrawerOpen(true)}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--gold)',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
          }}
          aria-label="Open menu"
        >
          <MenuIcon size={22} />
        </button>
      </header>

      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            animation: 'headerDrawerFade 0.2s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: 'min(86vw, 360px)',
              background: '#0a0a0a',
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'headerDrawerSlide 0.25s ease',
              boxShadow: '-12px 0 40px rgba(0,0,0,0.6)',
            }}
          >
            {/* Drawer Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}>
              <span style={{
                color: 'var(--gold)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 2.5,
                textTransform: 'uppercase',
              }}>
                Menu
              </span>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--gray)',
                  cursor: 'pointer',
                  width: 44,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: -8,
                }}
                aria-label="Close menu"
              >
                <X size={22} />
              </button>
            </div>

            {/* Nav Items */}
            <nav style={{ flex: 1, padding: '12px 0', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              <DrawerLink onClick={() => scrollToSection('menu')} label="Menu" />
              <DrawerLink onClick={() => scrollToSection('location')} label="Location" />

              {isAdmin && (
                <>
                  <DrawerDivider label="Admin" />
                  <DrawerLink href="/order" label="Order Online" icon={<ShoppingBag size={16} />} accentColor="var(--gold)" emphasized />
                  <DrawerLink href="/my-orders" label="My Orders" icon={<Receipt size={16} />} accentColor="#60a5fa" />
                  <DrawerLink href="/admin/dashboard" label="Dashboard" icon={<BarChart3 size={16} />} accentColor="#a78bfa" />
                  <DrawerLink href="/admin/print-menu" label="Print Menu" icon={<Printer size={16} />} accentColor="var(--gold)" muted />
                </>
              )}

              {isOwner && (
                <DrawerLink href="/admin/billing" label="Billing" icon={<CreditCard size={16} />} accentColor="#34d399" emphasized />
              )}
            </nav>

            {/* Footer */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '14px 20px' }}>
              {isAdmin ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--gray)', letterSpacing: 0.4 }}>
                    Logged in as <span style={{ color: 'var(--gold)' }}>{user?.email?.split('@')[0] || 'Admin'}</span>
                  </span>
                  <button
                    onClick={handleSignOut}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--gold)',
                      padding: '10px 12px',
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: 0.5,
                      cursor: 'pointer',
                    }}
                  >
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setDrawerOpen(false); onAdminClick() }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--gray)',
                    padding: '10px 12px',
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: 0.5,
                    cursor: 'pointer',
                    width: '100%',
                    justifyContent: 'center',
                  }}
                >
                  <Lock size={14} /> Admin Login
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes headerDrawerFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes headerDrawerSlide { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </>
  )
}

interface DrawerLinkProps {
  label: string
  href?: string
  onClick?: () => void
  icon?: React.ReactNode
  accentColor?: string
  emphasized?: boolean
  muted?: boolean
}

function DrawerLink({ label, href, onClick, icon, accentColor, emphasized, muted }: DrawerLinkProps) {
  const color = accentColor || 'var(--white)'
  const baseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 20px',
    color,
    background: 'none',
    border: 'none',
    fontSize: emphasized ? 15 : 14,
    fontWeight: emphasized ? 700 : 500,
    letterSpacing: 0.6,
    textDecoration: 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    opacity: muted ? 0.65 : 1,
    transition: 'background 0.15s',
  }
  if (href) {
    return (
      <a href={href} style={baseStyle}>
        {icon}
        {label}
      </a>
    )
  }
  return (
    <button onClick={onClick} style={baseStyle}>
      {icon}
      {label}
    </button>
  )
}

function DrawerDivider({ label }: { label: string }) {
  return (
    <div style={{
      padding: '14px 20px 6px',
      color: 'var(--gold)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 2,
      textTransform: 'uppercase',
      opacity: 0.7,
    }}>
      {label}
    </div>
  )
}
