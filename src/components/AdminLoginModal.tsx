import { useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../config/supabase'

interface Props {
  onClose: () => void
  title?: string
  showSignup?: boolean
}

type Mode = 'login' | 'signup'

export default function AdminLoginModal({ onClose, title = 'Admin Login', showSignup = false }: Props) {
  const { signIn } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isSignup = mode === 'signup'
  const headerLabel = showSignup ? (isSignup ? 'Create Account' : 'Log In') : title

  const switchMode = (next: Mode) => {
    setMode(next)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (isSignup) {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        setLoading(false)
        return
      }
      const { error: signupErr } = await supabase.auth.signUp({
        email,
        password,
        options: { data: name ? { full_name: name } : undefined },
      })
      if (signupErr) {
        setError(signupErr.message)
        setLoading(false)
        return
      }
      const { error: signInErr } = await signIn(email, password)
      if (signInErr) {
        setError(signInErr.message)
        setLoading(false)
        return
      }
      onClose()
      return
    }

    const { error: signInErr } = await signIn(email, password)
    if (signInErr) {
      setError(signInErr.message)
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
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, color: 'var(--gold)' }}>{headerLabel}</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--gray)', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isSignup && (
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              style={inputStyle}
              autoComplete="name"
              autoCapitalize="words"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
          <input
            type="password"
            placeholder={isSignup ? 'Password (6+ characters)' : 'Password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
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
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading
              ? (isSignup ? 'Creating account...' : 'Signing in...')
              : (isSignup ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        {showSignup && (
          <p style={{ color: 'var(--gray)', fontSize: 13, textAlign: 'center', marginTop: 18, marginBottom: 0 }}>
            {isSignup ? 'Already have an account? ' : 'No account? '}
            <button
              onClick={() => switchMode(isSignup ? 'login' : 'signup')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--gold)',
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
                fontWeight: 600,
              }}
            >
              {isSignup ? 'Log in' : 'Sign up'}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
