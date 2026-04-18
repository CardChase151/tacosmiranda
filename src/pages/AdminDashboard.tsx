import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../config/supabase'
import { BarChart3, Download, DollarSign, ShoppingBag, Receipt, TrendingUp, Loader2 } from 'lucide-react'

type Order = {
  id: string
  order_number: string
  customer_name: string | null
  total: number
  subtotal: number
  tax: number
  stripe_fee_amount: number
  application_fee_amount: number
  net_amount: number | null
  paid_at: string | null
  created_at: string
  status: string
}

type Range = 'today' | 'week' | 'month' | 'ytd' | 'all'

function startOf(r: Range): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (r === 'today') return d
  if (r === 'week') {
    const day = d.getDay()
    const diff = day === 0 ? 6 : day - 1
    d.setDate(d.getDate() - diff)
    return d
  }
  if (r === 'month') return new Date(d.getFullYear(), d.getMonth(), 1)
  if (r === 'ytd') return new Date(d.getFullYear(), 0, 1)
  return new Date(0)
}

export default function AdminDashboard() {
  const { user, isAdmin, loading } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [fetching, setFetching] = useState(false)
  const [range, setRange] = useState<Range>('today')

  const fetchOrders = async () => {
    setFetching(true)
    const since = startOf(range).toISOString()
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, total, subtotal, tax, stripe_fee_amount, application_fee_amount, net_amount, paid_at, created_at, status')
      .in('status', ['pending', 'confirmed', 'completed'])
      .gte('paid_at', since)
      .order('paid_at', { ascending: false })
      .limit(500)
    setOrders((data as Order[]) || [])
    setFetching(false)
  }

  useEffect(() => {
    if (!loading && user && isAdmin) fetchOrders()
  }, [loading, user, isAdmin, range])

  const totals = useMemo(() => {
    const t = { gross: 0, subtotal: 0, tax: 0, stripeFee: 0, appFee: 0, net: 0, count: orders.length }
    for (const o of orders) {
      t.gross += Number(o.total || 0)
      t.subtotal += Number(o.subtotal || 0)
      t.tax += Number(o.tax || 0)
      t.stripeFee += Number(o.stripe_fee_amount || 0)
      t.appFee += Number(o.application_fee_amount || 0)
      t.net += Number(o.net_amount ?? (o.total - (o.stripe_fee_amount || 0) - (o.application_fee_amount || 0)))
    }
    return t
  }, [orders])

  const exportCSV = () => {
    const header = ['Order #', 'Customer', 'Paid At', 'Subtotal', 'Tax', 'Gross', 'Stripe Fee', 'Platform Fee (1%)', 'Net to You']
    const rows = orders.map(o => [
      o.order_number,
      o.customer_name || '',
      o.paid_at || o.created_at,
      o.subtotal?.toFixed(2) || '0.00',
      o.tax?.toFixed(2) || '0.00',
      o.total?.toFixed(2) || '0.00',
      (o.stripe_fee_amount || 0).toFixed(2),
      (o.application_fee_amount || 0).toFixed(2),
      (o.net_amount ?? (o.total - (o.stripe_fee_amount || 0) - (o.application_fee_amount || 0))).toFixed(2),
    ])
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tacos-miranda-sales-${range}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={wrap}><Loader2 className="spin" size={24} /> Loading…</div>
  if (!user || !isAdmin) {
    return (
      <div style={wrap}>
        <h1 style={{ color: 'var(--gold)' }}>Not authorized</h1>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <BarChart3 size={28} style={{ color: '#a78bfa' }} />
          <h1 style={{ color: 'var(--gold)', fontFamily: 'var(--font-heading)', margin: 0 }}>Sales Dashboard</h1>
        </div>
        <p style={{ color: 'var(--gray)', marginBottom: 24 }}>
          Online orders only. Numbers reflect paid orders — failed or pending-payment orders are excluded.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {(['today', 'week', 'month', 'ytd', 'all'] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                ...rangeBtn,
                background: range === r ? '#a78bfa' : 'transparent',
                color: range === r ? '#000' : 'var(--gold)',
                borderColor: range === r ? '#a78bfa' : 'var(--border)',
              }}
            >
              {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : r === 'ytd' ? 'Year to Date' : 'All Time'}
            </button>
          ))}
          <button onClick={exportCSV} style={{ ...rangeBtn, marginLeft: 'auto' }}>
            <Download size={14} /> Export CSV
          </button>
        </div>

        <div style={statsGrid}>
          <Stat icon={<DollarSign size={20} />} label="Gross Sales" value={`$${totals.gross.toFixed(2)}`} hint="Total customers paid" color="#34d399" />
          <Stat icon={<ShoppingBag size={20} />} label="Orders" value={String(totals.count)} hint="Paid order count" color="#a78bfa" />
          <Stat icon={<TrendingUp size={20} />} label="Avg Ticket" value={`$${(totals.count ? totals.gross / totals.count : 0).toFixed(2)}`} hint="Per order" color="#60a5fa" />
          <Stat icon={<Receipt size={20} />} label="Tax Collected" value={`$${totals.tax.toFixed(2)}`} hint="Pass-through to state" color="#eab308" />
        </div>

        <div style={card}>
          <h2 style={h2}>Fee Breakdown</h2>
          <RowLine label="Gross sales" value={totals.gross} color="#34d399" />
          <RowLine label="Stripe processing fees" value={-totals.stripeFee} color="#ef4444" hint="Stripe's ~2.9% + $0.30 per charge" />
          <RowLine label="Platform fee (1%)" value={-totals.appFee} color="#ef4444" hint="Tacos Miranda online ordering service" />
          <RowLine label="Net to your bank" value={totals.net} color="#34d399" bold />
          <p style={{ color: 'var(--gray)', fontSize: 12, marginTop: 16 }}>
            Stripe deducts these fees before paying out to your bank. Both Stripe fees and the platform fee are deductible business expenses for taxes.
          </p>
        </div>

        <div style={card}>
          <h2 style={h2}>Recent Orders</h2>
          {fetching ? (
            <p style={{ color: 'var(--gray)' }}><Loader2 size={14} className="spin" /> Loading…</p>
          ) : orders.length === 0 ? (
            <p style={{ color: 'var(--gray)' }}>No paid orders in this range.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={th}>Order #</th>
                    <th style={th}>Customer</th>
                    <th style={th}>Paid</th>
                    <th style={{ ...th, textAlign: 'right' }}>Gross</th>
                    <th style={{ ...th, textAlign: 'right' }}>Fees</th>
                    <th style={{ ...th, textAlign: 'right' }}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 50).map(o => {
                    const fees = (o.stripe_fee_amount || 0) + (o.application_fee_amount || 0)
                    const net = o.net_amount ?? o.total - fees
                    return (
                      <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={td}>{o.order_number}</td>
                        <td style={td}>{o.customer_name || 'Guest'}</td>
                        <td style={td}>{o.paid_at ? new Date(o.paid_at).toLocaleString() : '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>${Number(o.total || 0).toFixed(2)}</td>
                        <td style={{ ...td, textAlign: 'right', color: '#ef4444' }}>-${fees.toFixed(2)}</td>
                        <td style={{ ...td, textAlign: 'right', color: '#34d399', fontWeight: 600 }}>${net.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {orders.length > 50 && (
                <p style={{ color: 'var(--gray)', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                  Showing 50 of {orders.length} — use CSV export to see all.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Stat({ icon, label, value, hint, color }: { icon: React.ReactNode; label: string; value: string; hint: string; color: string }) {
  return (
    <div style={{ ...card, margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--font-heading)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>{hint}</div>
    </div>
  )
}

function RowLine({ label, value, color, bold, hint }: { label: string; value: number; color?: string; bold?: boolean; hint?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ color: 'var(--gray)', fontWeight: bold ? 700 : 400 }}>{label}</div>
        {hint && <div style={{ color: 'var(--gray)', fontSize: 11, opacity: 0.7 }}>{hint}</div>}
      </div>
      <div style={{ color: color || 'var(--gold)', fontWeight: bold ? 700 : 500, fontSize: bold ? 18 : 16 }}>
        {value < 0 ? '-' : ''}${Math.abs(value).toFixed(2)}
      </div>
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
const statsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 16,
  marginBottom: 24,
}
const rangeBtn: React.CSSProperties = {
  padding: '8px 14px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--gold)',
  cursor: 'pointer',
  fontSize: 13,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', color: 'var(--gray)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }
const td: React.CSSProperties = { padding: '10px 8px', color: 'var(--gold)', fontSize: 14 }
