import { useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface Props {
  onClose: () => void
}

export default function AdminLoginModal({ onClose }: Props) {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      onClose()
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    background: 'var(--dark-input)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--white)',
    fontSize: 14,
    outline: 'none',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--dark-card)',
          border: '1px solid var(--gold)',
          borderRadius: 16,
          padding: 32,
          width: 380,
          maxWidth: '90vw',
          animation: 'fadeInUp 0.3s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, color: 'var(--gold)' }}>Admin Login</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--gray)', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputStyle}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputStyle}
            required
          />
          {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: 'var(--gold)',
              color: 'var(--black)',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
