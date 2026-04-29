import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { ArrowLeft, ShoppingCart, RotateCcw, ChevronDown, ChevronUp, Check } from 'lucide-react'

interface OrderItemMod {
  modifier_name: string
  upcharge: number
}

interface OrderItemIng {
  ingredient_name: string
  action: 'remove' | 'extra'
  extra_charge: number
}

interface OrderItem {
  id: string
  menu_item_id: string
  item_name: string
  quantity: number
  unit_price: number
  line_total: number
  special_instructions: string
  modifiers: OrderItemMod[]
  ingredients: OrderItemIng[]
}

interface OrderRecord {
  id: string
  order_number: string
  customer_name: string
  status: string
  subtotal: number
  tax: number
  total: number
  special_instructions: string
  created_at: string
  items: OrderItem[]
}

export default function MyOrders() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [menuPrices, setMenuPrices] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  // Clear cart only when Stripe redirects here with a session_id (payment confirmed).
  useEffect(() => {
    if (sessionId) {
      try { localStorage.removeItem('tm_cart') } catch { /* ignore */ }
    }
  }, [sessionId])

  const fetchOrders = useCallback(async () => {
    if (!user) return
    // Hide zombie orders (cancelled checkouts the customer can't act on).
    const { data: orderRows } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .not('status', 'in', '(awaiting_payment,failed)')
      .order('created_at', { ascending: false })

    if (!orderRows || orderRows.length === 0) {
      setOrders([])
      setLoading(false)
      return
    }

    const orderIds = orderRows.map(o => o.id)

    const itemsRes = await supabase.from('order_items').select('*').in('order_id', orderIds)
    const allItems = itemsRes.data || []
    const allItemIds = allItems.map(i => i.id)

    const [modsRes, ingsRes, menuRes] = await Promise.all([
      allItemIds.length
        ? supabase.from('order_item_modifiers').select('*').in('order_item_id', allItemIds)
        : Promise.resolve({ data: [] as any[] }),
      allItemIds.length
        ? supabase.from('order_item_ingredients').select('*').in('order_item_id', allItemIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from('menu_items').select('id, price'),
    ])

    const allMods = modsRes.data || []
    const allIngs = ingsRes.data || []
    const priceMap: Record<string, number> = {}
    for (const m of menuRes.data || []) priceMap[m.id] = Number(m.price)
    setMenuPrices(priceMap)

    const enriched: OrderRecord[] = orderRows.map(order => {
      const items = allItems
        .filter(i => i.order_id === order.id)
        .map(item => ({
          ...item,
          modifiers: allMods.filter(m => m.order_item_id === item.id).map(m => ({
            modifier_name: m.modifier_name,
            upcharge: m.upcharge,
          })),
          ingredients: allIngs.filter(ing => ing.order_item_id === item.id).map(ing => ({
            ingredient_name: ing.ingredient_name,
            action: ing.action as 'remove' | 'extra',
            extra_charge: ing.extra_charge,
          })),
        }))
      return { ...order, items }
    })

    setOrders(enriched)
    setLoading(false)
  }, [user])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const buildCartFromOrder = (order: OrderRecord) => {
    return order.items.map(item => {
      // Saved unit_price is the bundled per-unit price (base + modifiers + extras).
      // The cart re-applies modifier/extra upcharges on top, so we must hand it the
      // BASE menu price. Fall back to a derived base if the menu item is gone.
      const modSum = item.modifiers.reduce((s, m) => s + Number(m.upcharge || 0), 0)
      const extraSum = item.ingredients
        .filter(i => i.action === 'extra')
        .reduce((s, i) => s + Number(i.extra_charge || 0), 0)
      const basePrice =
        menuPrices[item.menu_item_id] ??
        Math.max(0, Number(item.unit_price) - modSum - extraSum)

      return {
        menu_item_id: item.menu_item_id,
        item_name: item.item_name,
        unit_price: basePrice,
        quantity: item.quantity,
        modifiers: item.modifiers.map(m => ({
          modifier_id: '',
          modifier_name: m.modifier_name,
          upcharge: Number(m.upcharge || 0),
        })),
        ingredients: item.ingredients.map(i => ({
          ingredient_id: '',
          ingredient_name: i.ingredient_name,
          action: i.action,
          extra_charge: Number(i.extra_charge || 0),
        })),
        special_instructions: item.special_instructions || '',
      }
    })
  }

  const handleAddToCart = (order: OrderRecord) => {
    const cartItems = buildCartFromOrder(order)
    // Store in sessionStorage so OrderOnline can pick it up
    sessionStorage.setItem('reorder_items', JSON.stringify(cartItems))
    navigate('/order')
  }

  const handleOrderAgain = (order: OrderRecord) => {
    const cartItems = buildCartFromOrder(order)
    sessionStorage.setItem('reorder_items', JSON.stringify(cartItems))
    sessionStorage.setItem('reorder_checkout', 'true')
    navigate('/order')
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4ade80'
      case 'preparing': return '#fbbf24'
      case 'cancelled': return '#ef4444'
      default: return '#60a5fa'
    }
  }

  if (!user) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--gray)', fontSize: 16 }}>Please log in to view your orders.</p>
        <Link to="/" style={{ color: 'var(--gold)', fontSize: 14 }}>Back to Home</Link>
      </div>
    )
  }

  return (
    <div style={{ padding: '40px 24px 100px', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: 32 }}>
        <Link to="/" style={{ position: 'absolute', left: 0, color: 'var(--gold)', display: 'flex', alignItems: 'center', textDecoration: 'none', fontSize: 14, gap: 4 }}>
          <ArrowLeft size={18} /> Back
        </Link>
        <h1 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 36,
          color: 'var(--white)',
          textAlign: 'center',
          letterSpacing: 4,
          margin: 0,
        }}>
          My Orders
        </h1>
      </div>

      {sessionId && (
        <div style={{
          background: 'rgba(74,222,128,0.08)',
          border: '1px solid rgba(74,222,128,0.3)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: '#4ade80',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Check size={16} color="#0a0a0a" />
          </div>
          <div>
            <p style={{ color: 'var(--white)', fontSize: 14, margin: 0, fontWeight: 600 }}>Payment received</p>
            <p style={{ color: 'var(--gray)', fontSize: 12, margin: '2px 0 0' }}>Your order is in. Confirmation email is on the way.</p>
          </div>
        </div>
      )}

      <div style={{
        background: 'rgba(200,168,78,0.06)',
        border: '1px solid rgba(200,168,78,0.2)',
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 24,
        textAlign: 'center',
      }}>
        <p style={{ color: 'var(--gray)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          Need to change or cancel an order? Online self-service isn't available since cooking starts immediately.
          Please call us at <a href="tel:6578454011" style={{ color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}>(657) 845-4011</a>.
        </p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--gray)', fontSize: 14, textAlign: 'center' }}>Loading orders...</p>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ color: 'var(--gray)', fontSize: 16, marginBottom: 16 }}>No orders yet.</p>
          <Link to="/order" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '12px 28px', background: 'var(--gold)', borderRadius: 10,
            color: 'var(--black)', fontSize: 15, fontWeight: 700, textDecoration: 'none',
          }}>
            <ShoppingCart size={18} /> Start Ordering
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {orders.map(order => {
            const isExpanded = expandedOrder === order.id
            return (
              <div
                key={order.id}
                style={{
                  background: 'var(--dark-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {/* Order Header - clickable to expand */}
                <button
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <span style={{
                          color: 'var(--gold)',
                          fontSize: 18,
                          fontWeight: 700,
                          fontFamily: 'var(--font-heading)',
                          letterSpacing: 2,
                        }}>
                          {order.order_number}
                        </span>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: statusColor(order.status),
                          background: `${statusColor(order.status)}15`,
                          padding: '2px 8px',
                          borderRadius: 4,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}>
                          {order.status}
                        </span>
                      </div>
                      <p style={{ color: 'var(--gray)', fontSize: 12, margin: 0 }}>
                        {formatDate(order.created_at)}
                      </p>
                      <p style={{ color: 'var(--gray)', fontSize: 12, margin: '2px 0 0' }}>
                        {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--white)', fontSize: 18, fontWeight: 700 }}>
                        ${Number(order.total).toFixed(2)}
                      </span>
                      {isExpanded ? <ChevronUp size={18} color="var(--gray)" /> : <ChevronDown size={18} color="var(--gray)" />}
                    </div>
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <div style={{ padding: '16px 20px' }}>
                      {order.items.map((item, idx) => {
                        const removed = item.ingredients.filter(i => i.action === 'remove')
                        const extras = item.ingredients.filter(i => i.action === 'extra')
                        return (
                          <div key={idx} style={{
                            padding: '10px 0',
                            borderBottom: idx < order.items.length - 1 ? '1px solid var(--border)' : 'none',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 600 }}>{item.quantity}x</span>
                                <span style={{ color: 'var(--white)', fontSize: 14 }}>{item.item_name}</span>
                              </div>
                              <span style={{ color: 'var(--white)', fontSize: 13, fontWeight: 500 }}>${Number(item.line_total).toFixed(2)}</span>
                            </div>
                            {item.modifiers.length > 0 && (
                              <p style={{ color: 'var(--gold)', fontSize: 11, margin: '3px 0 0', paddingLeft: 24 }}>
                                {item.modifiers.map(m => m.modifier_name).join(', ')}
                              </p>
                            )}
                            {removed.length > 0 && (
                              <p style={{ color: '#aa6666', fontSize: 10, margin: '2px 0 0', paddingLeft: 24 }}>
                                {removed.map(i => `NO ${i.ingredient_name}`).join(', ')}
                              </p>
                            )}
                            {extras.length > 0 && (
                              <p style={{ color: '#66aa66', fontSize: 10, margin: '2px 0 0', paddingLeft: 24 }}>
                                {extras.map(i => `EXTRA ${i.ingredient_name}${i.extra_charge > 0 ? ` (+$${Number(i.extra_charge).toFixed(2)})` : ''}`).join(', ')}
                              </p>
                            )}
                            {item.special_instructions && (
                              <p style={{ color: 'var(--gray)', fontSize: 11, fontStyle: 'italic', margin: '3px 0 0', paddingLeft: 24 }}>
                                {item.special_instructions}
                              </p>
                            )}
                          </div>
                        )
                      })}

                      {/* Totals */}
                      <div style={{ paddingTop: 12, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--gray)', fontSize: 12 }}>Subtotal</span>
                          <span style={{ color: 'var(--white)', fontSize: 12 }}>${Number(order.subtotal).toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--gray)', fontSize: 12 }}>Tax</span>
                          <span style={{ color: 'var(--white)', fontSize: 12 }}>${Number(order.tax).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{
                      display: 'flex', gap: 10,
                      padding: '12px 20px 16px',
                      borderTop: '1px solid var(--border)',
                    }}>
                      <button
                        onClick={() => handleAddToCart(order)}
                        style={{
                          flex: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '10px 16px',
                          background: 'none',
                          border: '1px solid #60a5fa',
                          borderRadius: 10,
                          color: '#60a5fa',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <ShoppingCart size={14} /> Add to Cart
                      </button>
                      <button
                        onClick={() => handleOrderAgain(order)}
                        style={{
                          flex: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '10px 16px',
                          background: 'var(--gold)',
                          border: 'none',
                          borderRadius: 10,
                          color: 'var(--black)',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <RotateCcw size={14} /> Order Again
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
