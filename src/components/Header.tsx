import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Lock, LogOut, Printer, CreditCard, BarChart3, Menu as MenuIcon, X, ShoppingBag, Activity, User, Users, Settings, ChevronDown, Database } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../config/supabase'

interface HeaderProps {
  onAdminClick: () => void
}

const MOBILE_BREAKPOINT = 768

interface AdminLink {
  to: string
  label: string
  icon: React.ReactNode
  ownerOnly?: boolean
}

// Every back-of-house destination in one place. Previously these were eleven
// separate items in five colors sitting in the customer nav.
const ADMIN_LINKS: AdminLink[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: <BarChart3 size={15} /> },
  { to: '/admin/analytics', label: 'Analytics', icon: <Activity size={15} /> },
  { to: '/admin/menu-data', label: 'Menu Data', icon: <Database size={15} /> },
  { to: '/admin/pins', label: 'Staff & Time Clock', icon: <Users size={15} /> },
  { to: '/admin/print-menu', label: 'Print Menu', icon: <Printer size={15} /> },
  { to: '/admin/billing', label: 'Billing', icon: <CreditCard size={15} />, ownerOnly: true },
]

export default function Header({ onAdminClick }: HeaderProps) {
  const { isAdmin, isOwner, user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  )
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [orderingEnabled, setOrderingEnabled] = useState(false)

  useEffect(() => {
    supabase
      .from('site_settings')
      .select('ordering_enabled')
      .eq('id', 'main')
      .maybeSingle()
      .then(({ data }) => {
        if (data) setOrderingEnabled(data.ordering_enabled ?? false)
      })
  }, [])

  const showOrderingNav = orderingEnabled || isAdmin

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (!mobile) setDrawerOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => { setManageOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!manageOpen) return
    const close = () => setManageOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [manageOpen])

  const adminLinks = ADMIN_LINKS.filter(l => !l.ownerOnly || isOwner)
  const onAdminRoute = location.pathname.startsWith('/admin')
  // Admins have a business to run; their own takeout history is not it.
  const showMyAccount = showOrderingNav && !isAdmin && !isOwner

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

  // The menu and location sections live on the homepage. From any other
  // route these used to be dead buttons; now they route home first and the
  // hash effect in App scrolls once Home has rendered.
  // A nav item is active when it points at the route you're on. Active items
  // stay gold on mouse-out instead of falling back to gray.
  const isActive = (path: string) => location.pathname === path

  const navLinkProps = (path: string) => {
    const active = isActive(path)
    return {
      style: {
        ...navTextStyle,
        textDecoration: 'none',
        color: active ? 'var(--gold)' : 'var(--gray)',
        fontWeight: active ? 700 : 500,
        borderBottom: active ? '2px solid var(--gold)' : '2px solid transparent',
        paddingBottom: 2,
      } as React.CSSProperties,
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
        e.currentTarget.style.color = 'var(--gold)'
      },
      onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
        e.currentTarget.style.color = active ? 'var(--gold)' : 'var(--gray)'
      },
    }
  }

  const scrollToSection = (id: string) => {
    setDrawerOpen(false)
    if (location.pathname !== '/') {
      navigate(`/#${id}`)
      return
    }
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const handleSignOut = () => {
    setDrawerOpen(false)
    signOut()
  }

  // ---------- DESKTOP LAYOUT ----------
  if (!isMobile) {
    return (
      <>
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
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo-white-transparent.png" alt="Tacos Miranda" style={{ height: 40 }} />
        </Link>

        {/* Customer nav. Identical for everyone, no role colors. */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <Link to="/" {...navLinkProps('/')}>Home</Link>
          <Link to="/menu" {...navLinkProps('/menu')}>Menu</Link>
          <button
            onClick={() => scrollToSection('location')}
            style={navTextStyle}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--gold)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--gray)'}
          >
            Location
          </button>
          {showOrderingNav && (
            <Link
              to="/order"
              style={{
                ...navTextStyle,
                color: 'var(--gold)',
                textDecoration: 'none',
                fontWeight: isActive('/order') ? 800 : 600,
                borderBottom: isActive('/order') ? '2px solid var(--gold)' : '2px solid transparent',
                paddingBottom: 2,
              }}
            >
              Order Online
            </Link>
          )}
          {showMyAccount && (
            <Link
              to="/my-orders"
              {...navLinkProps('/my-orders')}
              style={{ ...navLinkProps('/my-orders').style, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <User size={14} /> My Account
            </Link>
          )}

          {/* Everything back-of-house lives behind one button. */}
          {isAdmin ? (
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setManageOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 14px', borderRadius: 8,
                  border: onAdminRoute || manageOpen ? '1px solid var(--gold)' : '1px solid var(--border)',
                  background: onAdminRoute || manageOpen ? 'rgba(200,168,78,0.12)' : 'transparent',
                  color: 'var(--gold)', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
                }}
              >
                <Settings size={15} /> Manage
                <ChevronDown size={14} style={{ transform: manageOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </button>

              {manageOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 232,
                  background: '#111', border: '1px solid var(--border)', borderRadius: 10,
                  boxShadow: '0 18px 44px rgba(0,0,0,0.6)', overflow: 'hidden', zIndex: 200,
                }}>
                  {adminLinks.map(l => (
                    <Link
                      key={l.to}
                      to={l.to}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 16px', fontSize: 14, textDecoration: 'none',
                        color: isActive(l.to) ? 'var(--gold)' : 'var(--white)',
                        background: isActive(l.to) ? 'rgba(200,168,78,0.10)' : 'transparent',
                        fontWeight: isActive(l.to) ? 700 : 500,
                      }}
                    >
                      {l.icon} {l.label}
                    </Link>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px' }}>
                    <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 8 }}>
                      Signed in as <span style={{ color: 'var(--gold)' }}>{user?.email?.split('@')[0] || 'admin'}</span>
                    </div>
                    <button
                      onClick={handleSignOut}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                        background: 'none', border: '1px solid var(--border)', borderRadius: 7,
                        color: 'var(--gray)', padding: '7px 10px', fontSize: 13, cursor: 'pointer',
                      }}
                    >
                      <LogOut size={13} /> Sign out
                    </button>
                  </div>
                </div>
              )}
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

      {/* Second row: only while you are actually inside admin. */}
      {isAdmin && onAdminRoute && (
        <div style={{
          position: 'sticky', top: 65, zIndex: 99,
          background: 'rgba(10,10,10,0.96)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
          padding: '0 24px', display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto',
        }}>
          {adminLinks.map(l => (
            <Link
              key={l.to}
              to={l.to}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '11px 14px', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap',
                color: isActive(l.to) ? 'var(--gold)' : 'var(--gray)',
                fontWeight: isActive(l.to) ? 700 : 500,
                borderBottom: isActive(l.to) ? '2px solid var(--gold)' : '2px solid transparent',
              }}
            >
              {l.icon} {l.label}
            </Link>
          ))}
        </div>
      )}
      </>
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
        <Link to="/" style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/logo-white-transparent.png" alt="Tacos Miranda" style={{ height: 36 }} />
        </Link>

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
              <DrawerLink href="/" label="Home" active={isActive('/')} onNavigate={() => setDrawerOpen(false)} />
              <DrawerLink href="/menu" label="Menu" active={isActive('/menu')} onNavigate={() => setDrawerOpen(false)} />
              <DrawerLink onClick={() => scrollToSection('location')} label="Location" />

              {showOrderingNav && (
                <DrawerLink href="/order" active={isActive('/order')} onNavigate={() => setDrawerOpen(false)}
                  label="Order Online" icon={<ShoppingBag size={16} />} accentColor="var(--gold)" emphasized />
              )}
              {showMyAccount && (
                <DrawerLink href="/my-orders" active={isActive('/my-orders')} onNavigate={() => setDrawerOpen(false)}
                  label="My Account" icon={<User size={16} />} />
              )}

              {isAdmin && (
                <>
                  <DrawerDivider label="Manage" />
                  {adminLinks.map(l => (
                    <DrawerLink
                      key={l.to}
                      href={l.to}
                      label={l.label}
                      icon={l.icon}
                      active={isActive(l.to)}
                      onNavigate={() => setDrawerOpen(false)}
                    />
                  ))}
                </>
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
  onNavigate?: () => void
  active?: boolean
  icon?: React.ReactNode
  accentColor?: string
  emphasized?: boolean
  muted?: boolean
}

function DrawerLink({ label, href, onClick, onNavigate, active, icon, accentColor, emphasized, muted }: DrawerLinkProps) {
  const color = active ? 'var(--gold)' : (accentColor || 'var(--white)')
  const baseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 20px',
    background: active ? 'rgba(200, 168, 78, 0.08)' : 'none',
    color,
    border: 'none',
    // Gold rail on the active row, drawn with an inset shadow so it doesn't
    // fight the `border: none` shorthand above.
    boxShadow: active ? 'inset 3px 0 0 var(--gold)' : 'none',
    fontSize: emphasized ? 15 : 14,
    fontWeight: active || emphasized ? 700 : 500,
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
      <Link to={href} style={baseStyle} onClick={onNavigate}>
        {icon}
        {label}
      </Link>
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
