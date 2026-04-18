import { useState, useEffect } from 'react'
import { supabase } from '../../config/supabase'
import { useCart } from '../../context/CartContext'
import { useAuth } from '../../context/AuthContext'
import { Check, ChevronDown, ChevronUp, ArrowLeft, LogIn, UserPlus, User } from 'lucide-react'
import type { CartItemIngredient } from '../../types'

type CheckoutMode = 'gate' | 'login' | 'signup' | 'checkout'

interface OrderCheckoutProps {
  onBack: () => void
}

export default function OrderCheckout({ onBack }: OrderCheckoutProps) {
  const cart = useCart()
  const { user, signIn } = useAuth()
  const [mode, setMode] = useState<CheckoutMode>(user ? 'checkout' : 'gate')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderInstructions, setOrderInstructions] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authName, setAuthName] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  // Auto-fill from profile
  useEffect(() => {
    if (user?.email) {
      setCustomerEmail(user.email)
      setMode('checkout')
      supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.full_name) setCustomerName(data.full_name)
          if (data?.phone) setCustomerPhone(data.phone)
        })
    }
  }, [user])

  const handleLogin = async () => {
    if (!authEmail || !authPassword) { setAuthError('Enter email and password.'); return }
    setAuthLoading(true)
    setAuthError(null)
    try {
      await signIn(authEmail, authPassword)
      setMode('checkout')
    } catch {
      setAuthError('Invalid email or password.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignup = async () => {
    if (!authEmail || !authPassword) { setAuthError('Enter email and password.'); return }
    if (authPassword.length < 6) { setAuthError('Password must be at least 6 characters.'); return }
    setAuthLoading(true)
    setAuthError(null)
    try {
      const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword })
      if (error) throw error
      // Auto sign in after signup
      await signIn(authEmail, authPassword)
      if (authName) setCustomerName(authName)
      setCustomerEmail(authEmail)
      setMode('checkout')
    } catch (err: any) {
      setAuthError(err.message || 'Signup failed.')
    } finally {
      setAuthLoading(false)
    }
  }
  const [submitting, setSubmitting] = useState(false)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [summaryExpanded, setSummaryExpanded] = useState(false)

  const generateOrderNumber = () => {
    const digits = Math.floor(1000 + Math.random() * 9000)
    return `TM-${digits}`
  }

  const handlePlaceOrder = async () => {
    if (!customerName.trim()) {
      setError('Please enter your name.')
      return
    }
    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid phone number.')
      return
    }
    if (!customerEmail.trim() || !customerEmail.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    if (cart.items.length === 0) {
      setError('Your cart is empty.')
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      // If Stripe is wired and accepting charges, route through Stripe Checkout.
      // The edge function creates the order (status='awaiting_payment') and returns a Stripe Checkout URL.
      const { data: stripeSettings } = await supabase
        .from('stripe_settings')
        .select('charges_enabled')
        .eq('id', 'main')
        .maybeSingle()

      if (stripeSettings?.charges_enabled) {
        const { data: checkoutData, error: checkoutErr } = await supabase.functions.invoke('stripe-checkout', {
          body: {
            items: cart.items.map(item => ({
              menu_item_id: item.menu_item_id,
              item_name: item.item_name,
              quantity: item.quantity,
              modifiers: item.modifiers.map(m => ({
                modifier_id: m.modifier_id,
                modifier_name: m.modifier_name,
                price_delta: m.upcharge || 0,
              })),
              ingredients: item.ingredients.map((ing: CartItemIngredient) => ({
                ingredient_id: ing.ingredient_id,
                ingredient_name: ing.ingredient_name,
                action: ing.action,
                extra_charge: ing.extra_charge || 0,
              })),
              special_instructions: item.special_instructions,
            })),
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            customer_email: customerEmail.trim().toLowerCase(),
            special_instructions: orderInstructions.trim(),
            success_url: `${window.location.origin}/my-orders?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${window.location.origin}/order?cancelled=true`,
          },
        })
        if (checkoutErr) throw checkoutErr
        if (checkoutData?.url) {
          cart.clearCart()
          window.location.href = checkoutData.url
          return
        }
        throw new Error('Stripe checkout did not return a redirect URL')
      }

      // Fallback: Stripe not configured yet, insert order directly (pre-payment-launch behavior)
      const number = generateOrderNumber()

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: number,
          user_id: user?.id || null,
          customer_name: customerName.trim(),
          customer_email: customerEmail.trim().toLowerCase(),
          customer_phone: customerPhone.trim(),
          status: 'pending',
          subtotal: cart.subtotal,
          tax: cart.tax,
          total: cart.total,
          special_instructions: orderInstructions.trim(),
        })
        .select()
        .single()

      if (orderError) throw orderError

      for (const item of cart.items) {
        const { data: orderItem, error: itemError } = await supabase
          .from('order_items')
          .insert({
            order_id: order.id,
            menu_item_id: item.menu_item_id,
            item_name: item.item_name,
            unit_price: item.unit_price,
            quantity: item.quantity,
            special_instructions: item.special_instructions,
            line_total: item.line_total,
          })
          .select()
          .single()

        if (itemError) throw itemError

        if (item.modifiers.length > 0) {
          const { error: modError } = await supabase
            .from('order_item_modifiers')
            .insert(item.modifiers.map(mod => ({
              order_item_id: orderItem.id,
              modifier_id: mod.modifier_id,
              modifier_name: mod.modifier_name,
              upcharge: mod.upcharge,
            })))
          if (modError) throw modError
        }

        if (item.ingredients.length > 0) {
          const { error: ingError } = await supabase
            .from('order_item_ingredients')
            .insert(item.ingredients.map((ing: CartItemIngredient) => ({
              order_item_id: orderItem.id,
              ingredient_id: ing.ingredient_id,
              ingredient_name: ing.ingredient_name,
              action: ing.action,
              extra_charge: ing.extra_charge,
            })))
          if (ingError) throw ingError
        }
      }

      try {
        await fetch('/.netlify/functions/order-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order: {
              order_number: number,
              customer_name: customerName.trim(),
              customer_email: customerEmail.trim().toLowerCase(),
              customer_phone: customerPhone.trim(),
              subtotal: cart.subtotal,
              tax: cart.tax,
              total: cart.total,
              special_instructions: orderInstructions.trim(),
              created_at: new Date().toISOString(),
            },
            items: cart.items.map(item => ({
              item_name: item.item_name,
              quantity: item.quantity,
              unit_price: item.unit_price,
              line_total: item.line_total,
              special_instructions: item.special_instructions,
              modifiers: item.modifiers,
              ingredients: item.ingredients,
            })),
          }),
        })
      } catch {
        console.warn('Email notification failed, order still placed.')
      }

      // Update profile with latest name/phone
      if (user?.id) {
        await supabase.from('profiles').update({
          full_name: customerName.trim(),
          phone: customerPhone.trim(),
        }).eq('id', user.id)
      }

      setOrderNumber(number)
      cart.clearCart()
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    background: 'var(--black)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--white)',
    fontSize: 14,
    fontFamily: 'var(--font-body)',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: 'var(--gray)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        animation: 'checkoutFadeIn 0.2s ease',
      }}
      onClick={onBack}
    >
      <style>{`
        @keyframes checkoutFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes checkoutSlideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes successPop { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        .checkout-modal::-webkit-scrollbar { display: none; }
        .checkout-modal { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div
        className="checkout-modal"
        style={{
          background: '#1a1a1a',
          borderRadius: 16,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
          margin: '0 16px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,168,78,0.15)',
          animation: orderNumber ? 'successPop 0.3s ease' : 'checkoutSlideUp 0.3s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Auth Gate */}
        {mode === 'gate' && (
          <div style={{ padding: '40px 32px', textAlign: 'center' }}>
            <h2 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 24,
              color: 'var(--white)',
              margin: '0 0 8px',
              letterSpacing: 2,
            }}>
              Save Your Order?
            </h2>
            <p style={{ color: 'var(--gray)', fontSize: 14, margin: '0 0 28px' }}>
              Create an account to reorder easily next time.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                onClick={() => { setAuthError(null); setMode('login') }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: '14px 24px', background: 'var(--gold)', border: 'none', borderRadius: 12,
                  color: 'var(--black)', fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
                }}
              >
                <LogIn size={18} /> Log In
              </button>
              <button
                onClick={() => { setAuthError(null); setMode('signup') }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: '14px 24px', background: 'none', border: '1px solid var(--gold)', borderRadius: 12,
                  color: 'var(--gold)', fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
                }}
              >
                <UserPlus size={18} /> Create Account
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ color: 'var(--gray)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <button
                onClick={() => setMode('checkout')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: '14px 24px', background: 'none', border: '1px solid var(--border)', borderRadius: 12,
                  color: 'var(--white)', fontSize: 15, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.5,
                }}
              >
                <User size={18} /> Continue as Guest
              </button>
            </div>
          </div>
        )}

        {/* Login Form */}
        {mode === 'login' && (
          <div style={{ padding: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <button onClick={() => setMode('gate')} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', display: 'flex', padding: 0 }}>
                <ArrowLeft size={18} />
              </button>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, color: 'var(--white)', margin: 0, letterSpacing: 2 }}>Log In</h2>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Email</label>
              <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="your@email.com" style={inputStyle} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Password</label>
              <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Password" style={inputStyle} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>
            {authError && (
              <div style={{ padding: '10px 14px', background: 'rgba(204,68,68,0.15)', border: '1px solid rgba(204,68,68,0.3)', borderRadius: 8, marginBottom: 16 }}>
                <p style={{ color: '#cc4444', fontSize: 13, margin: 0 }}>{authError}</p>
              </div>
            )}
            <button onClick={handleLogin} disabled={authLoading} style={{
              width: '100%', padding: '14px', background: authLoading ? 'var(--gray)' : 'var(--gold)', border: 'none', borderRadius: 12,
              color: 'var(--black)', fontSize: 16, fontWeight: 700, cursor: authLoading ? 'default' : 'pointer',
            }}>
              {authLoading ? 'Logging in...' : 'Log In'}
            </button>
            <p style={{ color: 'var(--gray)', fontSize: 13, textAlign: 'center', marginTop: 16, marginBottom: 0 }}>
              No account? <button onClick={() => { setAuthError(null); setMode('signup') }} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 13, padding: 0 }}>Sign up</button>
            </p>
          </div>
        )}

        {/* Signup Form */}
        {mode === 'signup' && (
          <div style={{ padding: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <button onClick={() => setMode('gate')} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', display: 'flex', padding: 0 }}>
                <ArrowLeft size={18} />
              </button>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, color: 'var(--white)', margin: 0, letterSpacing: 2 }}>Create Account</h2>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Name</label>
              <input type="text" value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Your name" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Email</label>
              <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="your@email.com" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Password</label>
              <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="At least 6 characters" style={inputStyle} onKeyDown={e => e.key === 'Enter' && handleSignup()} />
            </div>
            {authError && (
              <div style={{ padding: '10px 14px', background: 'rgba(204,68,68,0.15)', border: '1px solid rgba(204,68,68,0.3)', borderRadius: 8, marginBottom: 16 }}>
                <p style={{ color: '#cc4444', fontSize: 13, margin: 0 }}>{authError}</p>
              </div>
            )}
            <button onClick={handleSignup} disabled={authLoading} style={{
              width: '100%', padding: '14px', background: authLoading ? 'var(--gray)' : 'var(--gold)', border: 'none', borderRadius: 12,
              color: 'var(--black)', fontSize: 16, fontWeight: 700, cursor: authLoading ? 'default' : 'pointer',
            }}>
              {authLoading ? 'Creating account...' : 'Create Account'}
            </button>
            <p style={{ color: 'var(--gray)', fontSize: 13, textAlign: 'center', marginTop: 16, marginBottom: 0 }}>
              Already have an account? <button onClick={() => { setAuthError(null); setMode('login') }} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 13, padding: 0 }}>Log in</button>
            </p>
          </div>
        )}

        {/* Success State */}
        {mode === 'checkout' && orderNumber ? (
          <div style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#44aa44',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <Check size={32} color="#fff" />
            </div>
            <h2 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 28,
              color: 'var(--white)',
              margin: '0 0 8px',
              letterSpacing: 2,
            }}>
              Order Placed!
            </h2>
            <p style={{ color: 'var(--gray)', fontSize: 14, margin: '0 0 24px' }}>
              Your order has been received.
            </p>
            <div style={{
              background: 'var(--dark-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '20px',
              marginBottom: 28,
            }}>
              <p style={{ color: 'var(--gray)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 4px' }}>
                Order Number
              </p>
              <p style={{
                color: 'var(--gold)',
                fontSize: 28,
                fontWeight: 700,
                fontFamily: 'var(--font-heading)',
                letterSpacing: 3,
                margin: 0,
              }}>
                {orderNumber}
              </p>
            </div>
            <button
              onClick={onBack}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 32px',
                background: 'var(--gold)',
                border: 'none',
                borderRadius: 10,
                color: 'var(--black)',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: 0.5,
              }}
            >
              <ArrowLeft size={16} />
              Back to Menu
            </button>
          </div>
        ) : mode === 'checkout' && !orderNumber ? (
          <>
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 24px 16px',
              borderBottom: '1px solid #333',
            }}>
              <h2 style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 22,
                color: 'var(--white)',
                margin: 0,
                letterSpacing: 2,
              }}>
                Checkout
              </h2>
              <button
                onClick={onBack}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'none',
                  border: 'none',
                  color: 'var(--gold)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                <ArrowLeft size={16} /> Back
              </button>
            </div>

            <div style={{ padding: '16px 24px 24px' }}>
              {/* Order Summary */}
              <div style={{
                background: '#222',
                border: '1px solid var(--border)',
                borderRadius: 10,
                marginBottom: 20,
                overflow: 'hidden',
              }}>
                <button
                  onClick={() => setSummaryExpanded(!summaryExpanded)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '14px 16px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ color: 'var(--white)', fontSize: 14, fontWeight: 600 }}>
                    Order Summary ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'})
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--gold)', fontSize: 14, fontWeight: 700 }}>
                      ${cart.total.toFixed(2)}
                    </span>
                    {summaryExpanded ? <ChevronUp size={16} color="var(--gray)" /> : <ChevronDown size={16} color="var(--gray)" />}
                  </div>
                </button>

                {summaryExpanded && (
                  <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)' }}>
                    {cart.items.map(item => {
                      const removed = item.ingredients.filter(i => i.action === 'remove')
                      const extras = item.ingredients.filter(i => i.action === 'extra')
                      return (
                        <div key={item.cart_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 600 }}>{item.quantity}x</span>
                              <span style={{ color: 'var(--white)', fontSize: 13 }}>{item.item_name}</span>
                            </div>
                            {item.modifiers.length > 0 && (
                              <p style={{ color: 'var(--gold)', fontSize: 11, margin: '3px 0 0', paddingLeft: 22 }}>
                                {item.modifiers.map(m => m.modifier_name).join(', ')}
                              </p>
                            )}
                            {removed.length > 0 && (
                              <p style={{ color: '#aa6666', fontSize: 10, margin: '2px 0 0', paddingLeft: 22 }}>
                                {removed.map(i => `NO ${i.ingredient_name}`).join(', ')}
                              </p>
                            )}
                            {extras.length > 0 && (
                              <p style={{ color: '#66aa66', fontSize: 10, margin: '2px 0 0', paddingLeft: 22 }}>
                                {extras.map(i => `EXTRA ${i.ingredient_name}${i.extra_charge > 0 ? ` (+$${i.extra_charge.toFixed(2)})` : ''}`).join(', ')}
                              </p>
                            )}
                            {item.special_instructions && (
                              <p style={{ color: 'var(--gray)', fontSize: 11, fontStyle: 'italic', margin: '3px 0 0', paddingLeft: 22 }}>{item.special_instructions}</p>
                            )}
                          </div>
                          <span style={{ color: 'var(--white)', fontSize: 13, fontWeight: 500, flexShrink: 0, marginLeft: 12 }}>${item.line_total.toFixed(2)}</span>
                        </div>
                      )
                    })}
                    <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--gray)', fontSize: 12 }}>Subtotal</span>
                        <span style={{ color: 'var(--white)', fontSize: 12 }}>${cart.subtotal.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--gray)', fontSize: 12 }}>Tax (7.75%)</span>
                        <span style={{ color: 'var(--white)', fontSize: 12 }}>${cart.tax.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--white)', fontSize: 14, fontWeight: 700 }}>Total</span>
                        <span style={{ color: 'var(--gold)', fontSize: 14, fontWeight: 700 }}>${cart.total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Info */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Name *</label>
                <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Your name" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Phone *</label>
                <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Email *</label>
                <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="your@email.com" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Special Instructions (Optional)</label>
                <textarea value={orderInstructions} onChange={e => setOrderInstructions(e.target.value)} placeholder="Any special requests..." rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} />
              </div>

              {error && (
                <div style={{ padding: '10px 14px', background: 'rgba(204,68,68,0.15)', border: '1px solid rgba(204,68,68,0.3)', borderRadius: 8, marginBottom: 16 }}>
                  <p style={{ color: '#cc4444', fontSize: 13, margin: 0 }}>{error}</p>
                </div>
              )}

              <button
                onClick={handlePlaceOrder}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: submitting ? 'var(--gray)' : 'var(--gold)',
                  border: 'none',
                  borderRadius: 12,
                  color: 'var(--black)',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: submitting ? 'default' : 'pointer',
                  letterSpacing: 0.5,
                }}
              >
                {submitting ? 'Placing Order...' : `Place Order - $${cart.total.toFixed(2)}`}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
