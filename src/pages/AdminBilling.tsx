import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../config/supabase'
import { CreditCard, CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'

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
  const [testMode, setTestMode] = useState(true)

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
    return <div style={wrap}><Loader2 size={24} className="spin" /> Loading…</div>
  }
  if (!user || !hasBilling) {
    return (
      <div style={wrap}>
        <h1 style={{ color: 'var(--gold)' }}>Not authorized</h1>
        <p style={{ color: 'var(--gray)' }}>This page is only for the owner.</p>
      </div>
    )
  }

  const ready = status?.charges_enabled && status?.payouts_enabled

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <CreditCard size={28} style={{ color: '#34d399' }} />
          <h1 style={{ color: 'var(--gold)', fontFamily: 'var(--font-heading)', margin: 0 }}>Billing</h1>
        </div>
        <p style={{ color: 'var(--gray)', marginBottom: 32 }}>
          Connect and manage your Stripe account. Tacos Miranda uses Stripe to accept online payments. You can update your banking info and see payouts from the Stripe dashboard at any time.
        </p>

        {testMode && (
          <div style={banner('#eab308')}>
            <AlertTriangle size={16} /> Test Mode — no real charges are processed. Toggle off when you are ready to go live.
          </div>
        )}

        {error && (
          <div style={banner('#ef4444')}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <div style={card}>
          <h2 style={h2}>Stripe Connection</h2>
          {!status ? (
            <p style={{ color: 'var(--gray)' }}>
              <Loader2 size={14} className="spin" /> Checking status…
            </p>
          ) : !status.connected ? (
            <>
              <p style={{ color: 'var(--gray)' }}>No Stripe account connected yet. Click below to set one up.</p>
              <button onClick={startOnboarding} disabled={working === 'onboard'} style={btnPrimary}>
                {working === 'onboard' ? <><Loader2 size={16} className="spin" /> Opening Stripe…</> : 'Connect Stripe Account'}
              </button>
            </>
          ) : !status.onboarding_complete ? (
            <>
              <StatusRow label="Onboarding" value="Incomplete" bad />
              <p style={{ color: 'var(--gray)', margin: '12px 0' }}>
                Finish setting up your Stripe account (banking, identity, etc.) before you can accept online orders.
              </p>
              <button onClick={startOnboarding} disabled={working === 'onboard'} style={btnPrimary}>
                {working === 'onboard' ? <><Loader2 size={16} className="spin" /> Opening Stripe…</> : 'Finish Onboarding'}
              </button>
            </>
          ) : (
            <>
              {status.business_name && <StatusRow label="Business" value={status.business_name} />}
              <StatusRow label="Onboarding" value={status.onboarding_complete ? 'Complete' : 'Incomplete'} bad={!status.onboarding_complete} />
              <StatusRow label="Accepting charges" value={status.charges_enabled ? 'Yes' : 'No'} bad={!status.charges_enabled} />
              <StatusRow label="Payouts enabled" value={status.payouts_enabled ? 'Yes' : 'No'} bad={!status.payouts_enabled} />
              {ready && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#34d399', margin: '16px 0' }}>
                  <CheckCircle2 size={18} /> Ready to accept online orders.
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                <button onClick={openDashboard} disabled={working === 'login'} style={btnPrimary}>
                  {working === 'login' ? <><Loader2 size={16} className="spin" /> Opening…</> : <><ExternalLink size={16} /> Manage Bank & Payouts</>}
                </button>
                <button onClick={fetchStatus} disabled={working === 'status'} style={btnGhost}>
                  {working === 'status' ? <><Loader2 size={16} className="spin" /> Refreshing…</> : 'Refresh Status'}
                </button>
              </div>
            </>
          )}
        </div>

        <div style={card}>
          <h2 style={h2}>Settings</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={testMode} onChange={toggleTestMode} />
            <span style={{ color: 'var(--gray)' }}>Test mode (no real payments)</span>
          </label>
        </div>
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function StatusRow({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--gray)' }}>{label}</span>
      <span style={{ color: bad ? '#ef4444' : 'var(--gold)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

const wrap: React.CSSProperties = { padding: 32, minHeight: '80vh', background: 'var(--bg)' }
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 24,
  marginBottom: 24,
}
const h2: React.CSSProperties = { color: 'var(--gold)', fontFamily: 'var(--font-heading)', fontSize: 20, margin: '0 0 16px' }
const btnPrimary: React.CSSProperties = {
  padding: '12px 20px',
  background: '#34d399',
  color: '#000',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}
const btnGhost: React.CSSProperties = {
  padding: '12px 20px',
  background: 'transparent',
  color: 'var(--gold)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}
const banner = (color: string): React.CSSProperties => ({
  padding: '12px 16px',
  background: `${color}22`,
  border: `1px solid ${color}66`,
  color,
  borderRadius: 8,
  marginBottom: 24,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
})
