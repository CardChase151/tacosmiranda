import { Lock, LogOut, Printer, CreditCard, BarChart3 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface HeaderProps {
  onAdminClick: () => void
}

export default function Header({ onAdminClick }: HeaderProps) {
  const { isAdmin, hasBilling, user, signOut } = useAuth()

  const navStyle: React.CSSProperties = {
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
    }}>
      <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img
          src="/logo-white-transparent.png"
          alt="Tacos Miranda"
          style={{ height: 40 }}
        />
      </a>

      <nav style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        <button
          onClick={() => document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' })}
          style={navStyle}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--gold)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--gray)'}
        >
          Menu
        </button>
        <button
          onClick={() => document.getElementById('location')?.scrollIntoView({ behavior: 'smooth' })}
          style={navStyle}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--gold)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--gray)'}
        >
          Location
        </button>
        {isAdmin && (
          <>
            <a
              href="/order"
              style={{
                ...navStyle,
                color: 'var(--gold)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Order Online
            </a>
            <a
              href="/my-orders"
              style={{
                ...navStyle,
                color: '#60a5fa',
                textDecoration: 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#93c5fd'}
              onMouseLeave={e => e.currentTarget.style.color = '#60a5fa'}
            >
              My Orders
            </a>
            <a
              href="/admin/dashboard"
              style={{
                ...navStyle,
                color: '#a78bfa',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#c4b5fd'}
              onMouseLeave={e => e.currentTarget.style.color = '#a78bfa'}
            >
              <BarChart3 size={14} /> Dashboard
            </a>
          </>
        )}
        {hasBilling && (
          <a
            href="/admin/billing"
            style={{
              ...navStyle,
              color: '#34d399',
              textDecoration: 'none',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
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
              onClick={signOut}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--gold)',
                opacity: 0.6,
                transition: 'opacity 0.2s',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
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
              background: 'none',
              border: 'none',
              color: 'var(--gray)',
              opacity: 0.3,
              transition: 'opacity 0.2s',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
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
