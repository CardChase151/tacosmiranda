import { Lock, LogOut, Printer } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface HeaderProps {
  onAdminClick: () => void
}

export default function Header({ onAdminClick }: HeaderProps) {
  const { isAdmin, user, signOut } = useAuth()

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
