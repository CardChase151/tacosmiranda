import { Link } from 'react-router-dom'
import { Home, UtensilsCrossed } from 'lucide-react'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '70vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '48px 24px',
      gap: 16,
    }}>
      <h1 style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 'clamp(32px, 8vw, 56px)',
        color: 'var(--gold)',
        margin: 0,
        letterSpacing: 2,
      }}>
        Page not found
      </h1>
      <p style={{ color: 'var(--gray)', fontSize: 16, maxWidth: 420, lineHeight: 1.6, margin: 0 }}>
        That link doesn't go anywhere. The menu and online ordering are still right here.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
        <Link to="/" style={btn}>
          <Home size={16} /> Home
        </Link>
        <Link to="/menu" style={{ ...btn, background: 'transparent', color: 'var(--gold)', border: '1px solid var(--gold)' }}>
          <UtensilsCrossed size={16} /> See the Menu
        </Link>
      </div>
    </div>
  )
}

const btn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 22px',
  borderRadius: 10,
  background: 'var(--gold)',
  color: 'var(--black)',
  border: '1px solid var(--gold)',
  fontSize: 14,
  fontWeight: 700,
  textDecoration: 'none',
}
