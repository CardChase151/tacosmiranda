import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../config/supabase'
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Banknote,
  Shield,
  TrendingUp,
  ArrowUpRight,
} from 'lucide-react'

interface Status {
  connected: boolean
  onboarding_complete?: boolean
  charges_enabled?: boolean
  payouts_enabled?: boolean
  business_name?: string | null
}

export default function AdminBilling() {
  const { user, hasBilling, loading } = useAuth()
  const [status, setStatus] = useState<Status | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testMode, setTestMode] = useState(false)
  const [showDev, setShowDev] = useState(false)

  const fetchStatus = async () => {
    setWorking('status')
    setError(null)
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect', {
        body: { action: 'check_status' },
      })
      if (error) throw error
      setStatus(data)

      const { data: s } = await supabase
        .from('stripe_settings')
        .select('test_mode')
        .eq('id', 'main')
        .maybeSingle()
      if (s) setTestMode(s.test_mode)
    } catch (e: any) {
      setError(e.message || 'Failed to load status')
    } finally {
      setWorking(null)
    }
  }

  useEffect(() => {
    if (!loading && user && hasBilling) fetchStatus()
  }, [loading, user, hasBilling])

  const startOnboarding = async () => {
    setWorking('onboard')
    setError(null)
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect', {
        body: {
          action: 'create_account',
          return_url: `${window.location.origin}/admin/billing?stripe=return`,
          refresh_url: `${window.location.origin}/admin/billing?stripe=refresh`,
        },
      })
      if (error) throw error
      if (data?.url) window.location.href = data.url
    } catch (e: any) {
      setError(e.message || 'Failed to start onboarding')
      setWorking(null)
    }
  }

  const openDashboard = async () => {
    setWorking('login')
    setError(null)
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect', {
        body: { action: 'login_link' },
      })
      if (error) throw error
      if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (e: any) {
      setError(e.message || 'Failed to generate dashboard link')
    } finally {
      setWorking(null)
    }
  }

  const toggleTestMode = async () => {
    const newVal = !testMode
    setTestMode(newVal)
    await supabase.from('stripe_settings').update({ test_mode: newVal }).eq('id', 'main')
  }

  if (loading) {
    return (
      <div style={pageWrap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--gray)' }}>
          <Loader2 size={18} className="spin" /> Loading…
        </div>
      </div>
    )
  }
  if (!user || !hasBilling) {
    return (
      <div style={pageWrap}>
        <div style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center' }}>
          <Shield size={40} style={{ color: 'var(--gold)', opacity: 0.5, marginBottom: 16 }} />
          <h1 style={{ color: 'var(--gold)', fontFamily: 'var(--font-heading)', margin: 0 }}>Owner access only</h1>
          <p style={{ color: 'var(--gray)', marginTop: 12 }}>This page is only available to the restaurant owner.</p>
        </div>
      </div>
    )
  }

  const ready = status?.charges_enabled && status?.payouts_enabled
  const inProgress = status?.connected && !status?.onboarding_complete

  return (
    <div style={pageWrap}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Title */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--gold)', opacity: 0.5, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
            <CreditCard size={14} /> Owner Billing
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 40, margin: 0, color: 'var(--white)', fontWeight: 300, letterSpacing: -0.5 }}>
            Payments & Payouts
          </h1>
          <p style={{ color: 'var(--gray)', marginTop: 12, maxWidth: 560, lineHeight: 1.6 }}>
            Connect your Stripe account to accept online orders. Once connected, you can update banking info and review payouts any time.
          </p>
        </div>

        {testMode && (
          <div style={bannerStyle}>
            <AlertTriangle size={16} /> <strong>Test Mode</strong> — payments are simulated. Toggle off when ready to accept real charges.
          </div>
        )}

        {error && (
          <div style={{ ...bannerStyle, background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {/* Status hero */}
        <div style={heroCard}>
          {!status ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--gray)', padding: '20px 0' }}>
              <Loader2 size={16} className="spin" /> Checking connection…
            </div>
          ) : !status.connected ? (
            <>
              <StatusPill color="var(--gray-dark)" label="Not Connected" />
              <h2 style={h2}>Set up online payments</h2>
              <p style={paraStyle}>
                You'll be redirected to Stripe to enter your business details, banking info, and identity verification. Takes a few minutes. You can come back and update any of it later.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '24px 0' }}>
                <MiniFact icon={<Shield size={16} />} label="Secure" hint="Powered by Stripe" />
                <MiniFact icon={<Banknote size={16} />} label="Direct deposits" hint="Straight to your bank" />
                <MiniFact icon={<TrendingUp size={16} />} label="1% platform fee" hint="Plus Stripe's ~2.9% + $0.30" />
              </div>
              <button onClick={startOnboarding} disabled={working === 'onboard'} style={btnPrimary}>
                {working === 'onboard' ? <><Loader2 size={16} className="spin" /> Opening Stripe…</> : <>Connect Stripe Account <ArrowUpRight size={16} /></>}
              </button>
            </>
          ) : inProgress ? (
            <>
              <StatusPill color="#eab308" label="Onboarding Incomplete" />
              <h2 style={h2}>Finish your Stripe setup</h2>
              <p style={paraStyle}>
                Stripe still needs a few more details (banking, identity, or business info) before we can accept orders.
              </p>
              <button onClick={startOnboarding} disabled={working === 'onboard'} style={btnPrimary}>
                {working === 'onboard' ? <><Loader2 size={16} className="spin" /> Opening Stripe…</> : <>Finish Onboarding <ArrowUpRight size={16} /></>}
              </button>
            </>
          ) : (
            <>
              <StatusPill color="#10b981" label={ready ? 'Ready to Accept Orders' : 'Partially Active'} />
              <h2 style={h2}>{status.business_name || 'Tacos Miranda'}</h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginTop: 20 }}>
                <StatTile label="Accepting charges" ok={!!status.charges_enabled} />
                <StatTile label="Payouts enabled" ok={!!status.payouts_enabled} />
              </div>

              {ready && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#10b981', padding: '16px 0', borderTop: '1px solid var(--border)', marginTop: 20 }}>
                  <CheckCircle2 size={18} />
                  <span style={{ fontSize: 14 }}>Online orders will deposit directly to your bank.</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                <button onClick={openDashboard} disabled={working === 'login'} style={btnPrimary}>
                  {working === 'login' ? <><Loader2 size={16} className="spin" /> Opening…</> : <><ExternalLink size={16} /> Manage Bank & Payouts</>}
                </button>
                <button onClick={fetchStatus} disabled={working === 'status'} style={btnGhost}>
                  {working === 'status' ? <><Loader2 size={16} className="spin" /> Refreshing…</> : 'Refresh'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Help */}
        <div style={helpCard}>
          <strong style={{ color: 'var(--gold)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Need help?</strong>
          <p style={{ color: 'var(--gray)', fontSize: 14, marginTop: 8, marginBottom: 0 }}>
            Stripe handles all payment processing and banking. For questions about a specific payout, log in to your Stripe dashboard using the button above.
          </p>
        </div>

        {/* Dev toggle — subtle, hidden by default */}
        <button onClick={() => setShowDev(!showDev)} style={devToggle}>
          {showDev ? 'Hide' : 'Show'} developer options
        </button>
        {showDev && (
          <div style={helpCard}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'var(--gray)', fontSize: 14 }}>
              <input type="checkbox" checked={testMode} onChange={toggleTestMode} />
              <span>Test mode (simulated payments, no real money)</span>
            </label>
          </div>
        )}
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function StatusPill({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${color}22`, border: `1px solid ${color}66`, color, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </div>
  )
}

function StatTile({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ padding: '14px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
      {ok ? <CheckCircle2 size={18} style={{ color: '#10b981' }} /> : <AlertTriangle size={18} style={{ color: '#ef4444' }} />}
      <div>
        <div style={{ fontSize: 11, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
        <div style={{ color: ok ? '#10b981' : '#ef4444', fontWeight: 600 }}>{ok ? 'Yes' : 'No'}</div>
      </div>
    </div>
  )
}

function MiniFact({ icon, label, hint }: { icon: React.ReactNode; label: string; hint: string }) {
  return (
    <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10, background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gold)', fontSize: 13, fontWeight: 600 }}>
        {icon} {label}
      </div>
      <div style={{ color: 'var(--gray)', fontSize: 11, marginTop: 4 }}>{hint}</div>
    </div>
  )
}

const pageWrap: React.CSSProperties = {
  padding: '48px 24px 80px',
  minHeight: '80vh',
  background: 'var(--dark)',
}

const heroCard: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(200,168,78,0.04) 0%, rgba(255,255,255,0.02) 100%)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 32,
  marginBottom: 24,
  boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
}

const helpCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
}

const h2: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontSize: 24,
  color: 'var(--white)',
  margin: '16px 0 8px',
  fontWeight: 500,
}

const paraStyle: React.CSSProperties = {
  color: 'var(--gray)',
  fontSize: 14,
  lineHeight: 1.6,
  margin: 0,
}

const btnPrimary: React.CSSProperties = {
  padding: '14px 24px',
  background: 'var(--gold)',
  color: 'var(--black)',
  border: 'none',
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: 0.3,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  transition: 'background 0.2s',
}

const btnGhost: React.CSSProperties = {
  padding: '14px 20px',
  background: 'transparent',
  color: 'var(--gold)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 14,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

const bannerStyle: React.CSSProperties = {
  padding: '12px 16px',
  background: 'rgba(234,179,8,0.1)',
  border: '1px solid rgba(234,179,8,0.3)',
  color: '#eab308',
  borderRadius: 10,
  marginBottom: 24,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 14,
}

const devToggle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--gray-dark)',
  fontSize: 12,
  cursor: 'pointer',
  padding: 8,
  textDecoration: 'underline',
  opacity: 0.5,
}
