import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../config/supabase'
import { BarChart3, Download, DollarSign, ShoppingBag, Receipt, TrendingUp, Loader2, Power, PowerOff, Printer, ChevronDown, ChevronRight, Check } from 'lucide-react'

type Order = {
  id: string
  order_number: string
  customer_name: string | null
  customer_phone: string | null
  total: number
  subtotal: number
  tax: number
  stripe_fee_amount: number
  application_fee_amount: number
  net_amount: number | null
  paid_at: string | null
  created_at: string
  status: string
  printed: boolean | null
  reprint_requested: boolean | null
  special_instructions: string | null
}

type OrderLine = {
  id: string
  item_name: string
  quantity: number | null
  unit_price: number
  line_total: number
  special_instructions: string | null
  sort_order: number | null
  modifiers: { modifier_name: string; upcharge: number | null }[]
  ingredients: { ingredient_name: string; action: string; extra_charge: number | null }[]
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
  const [orderingEnabled, setOrderingEnabled] = useState<boolean>(true)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toggling, setToggling] = useState(false)

  const fetchOrders = async () => {
    setFetching(true)
    const since = startOf(range).toISOString()
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, customer_phone, total, subtotal, tax, stripe_fee_amount, application_fee_amount, net_amount, paid_at, created_at, status, printed, reprint_requested, special_instructions')
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

  useEffect(() => {
    if (!loading && user && isAdmin) {
      supabase
        .from('site_settings')
        .select('ordering_enabled')
        .eq('id', 'main')
        .maybeSingle()
        .then(({ data }) => {
          if (data) setOrderingEnabled(data.ordering_enabled ?? true)
        })
    }
  }, [loading, user, isAdmin])

  const handleToggleOrdering = async () => {
    setToggling(true)
    const next = !orderingEnabled
    const { error } = await supabase
      .from('site_settings')
      .update({ ordering_enabled: next })
      .eq('id', 'main')
    setToggling(false)
    if (!error) {
      setOrderingEnabled(next)
      setConfirmOpen(false)
    }
  }

  // ── Order detail + reprint ────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [lines, setLines] = useState<Record<string, OrderLine[]>>({})
  const [loadingLines, setLoadingLines] = useState<string | null>(null)
  const [reprinting, setReprinting] = useState<string | null>(null)
  const [reprintQueued, setReprintQueued] = useState<Record<string, boolean>>({})

  const toggleExpand = async (orderId: string) => {
    if (expandedId === orderId) { setExpandedId(null); return }
    setExpandedId(orderId)
    if (lines[orderId]) return

    setLoadingLines(orderId)
    const { data: items } = await supabase
      .from('order_items')
      .select('id, item_name, quantity, unit_price, line_total, special_instructions, sort_order')
      .eq('order_id', orderId)
      .order('sort_order')

    const itemIds = (items || []).map(i => i.id)
    const [modRes, ingRes] = itemIds.length
      ? await Promise.all([
          supabase.from('order_item_modifiers').select('order_item_id, modifier_name, upcharge').in('order_item_id', itemIds),
          supabase.from('order_item_ingredients').select('order_item_id, ingredient_name, action, extra_charge').in('order_item_id', itemIds),
        ])
      : [{ data: [] }, { data: [] }]

    const built: OrderLine[] = (items || []).map(i => ({
      ...i,
      modifiers: (modRes.data || []).filter((m: any) => m.order_item_id === i.id),
      ingredients: (ingRes.data || []).filter((g: any) => g.order_item_id === i.id),
    })) as OrderLine[]

    setLines(prev => ({ ...prev, [orderId]: built }))
    setLoadingLines(null)
  }

  // Re-queues the ticket for the CloudPRNT printer. Order status is untouched;
  // the printer clears the flag when it confirms the job.
  const handleReprint = async (orderId: string) => {
    setReprinting(orderId)
    const { error } = await supabase
      .from('orders')
      .update({ reprint_requested: true, reprint_requested_at: new Date().toISOString() })
      .eq('id', orderId)
    setReprinting(null)
    if (error) { alert(`Couldn't queue the reprint: ${error.message}`); return }
    setReprintQueued(prev => ({ ...prev, [orderId]: true }))
    setTimeout(() => setReprintQueued(prev => ({ ...prev, [orderId]: false })), 6000)
  }

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

        <div style={{
          background: orderingEnabled ? 'rgba(52, 211, 153, 0.08)' : 'rgba(239, 68, 68, 0.12)',
          border: orderingEnabled ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 220 }}>
            {orderingEnabled
              ? <Power size={24} color="#34d399" />
              : <PowerOff size={24} color="#ef4444" />}
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
                Online Orders
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: orderingEnabled ? '#34d399' : '#ef4444' }}>
                {orderingEnabled ? 'LIVE — Customers can order' : 'PAUSED — Customers see closed message'}
              </div>
            </div>
          </div>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={toggling}
            style={{
              padding: '10px 18px',
              background: orderingEnabled ? 'rgba(239, 68, 68, 0.15)' : 'rgba(52, 211, 153, 0.15)',
              border: orderingEnabled ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(52, 211, 153, 0.5)',
              borderRadius: 8,
              color: orderingEnabled ? '#ef4444' : '#34d399',
              fontWeight: 700,
              cursor: toggling ? 'default' : 'pointer',
              fontSize: 13,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {toggling
              ? <Loader2 size={14} className="spin" />
              : (orderingEnabled ? <PowerOff size={14} /> : <Power size={14} />)}
            {orderingEnabled ? 'Pause Orders' : 'Go Live'}
          </button>
        </div>

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
                    <th style={{ ...th, width: 32 }} />
                    <th style={th}>Order #</th>
                    <th style={th}>Customer</th>
                    <th style={th}>Paid</th>
                    <th style={{ ...th, textAlign: 'right' }}>Gross</th>
                    <th style={{ ...th, textAlign: 'right' }}>Fees</th>
                    <th style={{ ...th, textAlign: 'right' }}>Net</th>
                    <th style={{ ...th, textAlign: 'right' }}>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 50).map(o => {
                    const fees = (o.stripe_fee_amount || 0) + (o.application_fee_amount || 0)
                    const net = o.net_amount ?? o.total - fees
                    const open = expandedId === o.id
                    const queued = !!reprintQueued[o.id] || !!o.reprint_requested
                    return (
                      <Fragment key={o.id}>
                        <tr
                          onClick={() => toggleExpand(o.id)}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: open ? 'rgba(167,139,250,0.06)' : 'transparent' }}
                        >
                          <td style={{ ...td, color: 'var(--gray)' }}>
                            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </td>
                          <td style={td}>{o.order_number}</td>
                          <td style={td}>{o.customer_name || 'Guest'}</td>
                          <td style={td}>{o.paid_at ? new Date(o.paid_at).toLocaleString() : '—'}</td>
                          <td style={{ ...td, textAlign: 'right' }}>${Number(o.total || 0).toFixed(2)}</td>
                          <td style={{ ...td, textAlign: 'right', color: '#ef4444' }}>-${fees.toFixed(2)}</td>
                          <td style={{ ...td, textAlign: 'right', color: '#34d399', fontWeight: 600 }}>${net.toFixed(2)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            <button
                              onClick={e => { e.stopPropagation(); handleReprint(o.id) }}
                              disabled={reprinting === o.id || queued}
                              title={queued ? 'Waiting for the printer to pick it up' : 'Print this receipt again'}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                border: queued ? '1px solid rgba(52,211,153,0.5)' : '1px solid var(--border)',
                                background: 'transparent',
                                color: queued ? '#34d399' : 'var(--gold)',
                                cursor: reprinting === o.id || queued ? 'default' : 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {reprinting === o.id
                                ? <Loader2 size={13} className="spin" />
                                : queued ? <Check size={13} /> : <Printer size={13} />}
                              {queued ? 'Queued' : 'Reprint'}
                            </button>
                          </td>
                        </tr>
                        {open && (
                          <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td colSpan={8} style={{ padding: '4px 8px 18px 40px' }}>
                              {loadingLines === o.id ? (
                                <p style={{ color: 'var(--gray)', fontSize: 13 }}><Loader2 size={13} className="spin" /> Loading items…</p>
                              ) : (lines[o.id] || []).length === 0 ? (
                                <p style={{ color: 'var(--gray)', fontSize: 13 }}>No line items recorded for this order.</p>
                              ) : (
                                <>
                                  {(lines[o.id] || []).map(li => (
                                    <div key={li.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                        <span style={{ color: 'var(--gold)', fontSize: 14, fontWeight: 600 }}>
                                          {li.quantity || 1}× {li.item_name}
                                        </span>
                                        <span style={{ color: 'var(--gold)', fontSize: 14 }}>${Number(li.line_total || 0).toFixed(2)}</span>
                                      </div>
                                      {li.modifiers.map((m, i) => (
                                        <div key={`m${i}`} style={{ color: 'var(--gray)', fontSize: 12, paddingLeft: 14 }}>
                                          + {m.modifier_name}{Number(m.upcharge) > 0 ? ` ($${Number(m.upcharge).toFixed(2)})` : ''}
                                        </div>
                                      ))}
                                      {li.ingredients.map((g, i) => (
                                        <div key={`g${i}`} style={{ color: g.action === 'remove' ? '#ef4444' : '#60a5fa', fontSize: 12, paddingLeft: 14 }}>
                                          {g.action === 'remove' ? 'NO' : 'EXTRA'} {g.ingredient_name}
                                          {Number(g.extra_charge) > 0 ? ` ($${Number(g.extra_charge).toFixed(2)})` : ''}
                                        </div>
                                      ))}
                                      {li.special_instructions && (
                                        <div style={{ color: '#eab308', fontSize: 12, paddingLeft: 14, fontStyle: 'italic' }}>
                                          "{li.special_instructions}"
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: 'var(--gray)' }}>
                                    {o.customer_phone && <span>Phone: {o.customer_phone}</span>}
                                    <span>Status: {o.status}</span>
                                    <span>Printed: {o.printed ? 'yes' : 'no'}</span>
                                  </div>
                                  {o.special_instructions && (
                                    <p style={{ color: '#eab308', fontSize: 13, marginTop: 8, fontStyle: 'italic' }}>
                                      Order note: "{o.special_instructions}"
                                    </p>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
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

      {confirmOpen && (
        <div
          onClick={() => !toggling && setConfirmOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#1a1a1a',
              borderRadius: 16,
              maxWidth: 480,
              width: '100%',
              padding: 32,
              border: orderingEnabled ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(52, 211, 153, 0.4)',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {orderingEnabled
                ? <PowerOff size={28} color="#ef4444" />
                : <Power size={28} color="#34d399" />}
              <h2 style={{
                fontFamily: 'var(--font-heading)',
                color: 'var(--white)',
                margin: 0,
                fontSize: 22,
                letterSpacing: 1,
              }}>
                {orderingEnabled ? 'Pause online orders?' : 'Go live with online orders?'}
              </h2>
            </div>
            <p style={{ color: 'var(--gray)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
              {orderingEnabled
                ? 'Customers will see a "we\'re closed" message and won\'t be able to place orders until you turn it back on. Use this if something breaks or you need to stop new orders right away.'
                : 'Customers will be able to place orders immediately. Make sure the kitchen is ready to receive them.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={toggling}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--gray)',
                  fontWeight: 600,
                  cursor: toggling ? 'default' : 'pointer',
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleToggleOrdering}
                disabled={toggling}
                style={{
                  padding: '10px 20px',
                  background: orderingEnabled ? '#ef4444' : '#34d399',
                  border: 'none',
                  borderRadius: 10,
                  color: '#fff',
                  fontWeight: 700,
                  cursor: toggling ? 'default' : 'pointer',
                  fontSize: 14,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {toggling && <Loader2 size={14} className="spin" />}
                {orderingEnabled ? 'Yes, pause orders' : 'Yes, go live'}
              </button>
            </div>
          </div>
        </div>
      )}
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
