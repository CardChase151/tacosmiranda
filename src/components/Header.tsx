import { Lock, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface HeaderProps {
  onAdminClick: () => void
}

export default function Header({ onAdminClick }: HeaderProps) {
  const { isAdmin, signOut } = useAuth()

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
