import { useState, useEffect } from 'react'
import { X, Mail } from 'lucide-react'
import { supabase } from '../config/supabase'

export default function EmailBanner() {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(true)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('tm_banner_dismissed')) return
    setDismissed(false)
    const timer = setTimeout(() => setVisible(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    localStorage.setItem('tm_banner_dismissed', 'true')
    setTimeout(() => setDismissed(true), 300)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await supabase.from('email_subscribers').insert({
        first_name: firstName,
        last_name: lastName,
        email: email.toLowerCase(),
      })
      try {
        await fetch('/.netlify/functions/send-welcome-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: email.toLowerCase(), firstName }),
        })
      } catch {}
      setSubmitted(true)
      localStorage.setItem('tm_banner_dismissed', 'true')
      setTimeout(() => { setVisible(false); setTimeout(() => setDismissed(true), 300) }, 2500)
    } catch {
      setLoading(false)
    }
  }

  if (dismissed) return null

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    background: 'var(--dark-input)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--white)',
    fontSize: 13,
    outline: 'none',
    width: '100%',
  }

  return (
    <div style={{
      position: 'fixed',
      top: 70,
      right: 20,
      zIndex: 500,
      width: 340,
      background: 'var(--dark-card)',
      borderRadius: 12,
      borderLeft: '3px solid var(--gold)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      transform: visible ? 'translateY(0)' : 'translateY(-120%)',
      opacity: visible ? 1 : 0,
      transition: 'transform 0.4s ease, opacity 0.4s ease',
      overflow: 'hidden',
    }}>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mail size={16} color="var(--gold)" />
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--white)' }}>
              Stay in the Loop
            </span>
          </div>
          <button
            onClick={handleDismiss}
            style={{ background: 'none', border: 'none', color: 'var(--gray-dark)', padding: 2 }}
          >
            <X size={16} />
          </button>
        </div>

        {submitted ? (
          <p style={{ color: 'var(--gold)', fontSize: 14, fontWeight: 500, textAlign: 'center', padding: '12px 0' }}>
            Welcome to the family!
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" style={inputStyle} required />
              <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" style={inputStyle} required />
            </div>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" style={inputStyle} required />
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px',
                background: 'var(--gold)',
                color: 'var(--black)',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginTop: 4,
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Joining...' : 'Join the List'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
