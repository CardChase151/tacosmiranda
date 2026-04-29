import { useCart } from '../../context/CartContext'
import { X, Trash2, Pencil, ShoppingCart } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { CartItem } from '../../types'

interface CartDrawerProps {
  isOpen: boolean
  onClose: () => void
  onCheckout: () => void
  onEdit?: (item: CartItem) => void
}

export default function CartDrawer({ isOpen, onClose, onCheckout, onEdit }: CartDrawerProps) {
  const cart = useCart()
  const [searchParams] = useSearchParams()
  const wasCancelled = searchParams.get('cancelled') === 'true'

  if (!isOpen) return null

  const TAX_RATE = 0.0775

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        animation: 'cartFadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        className="cart-drawer-modal"
        style={{
          background: 'var(--dark-card)',
          border: '1px solid rgba(200,168,78,0.2)',
          borderRadius: 16,
          maxHeight: '85vh',
          width: '100%',
          maxWidth: 520,
          margin: '0 16px',
          display: 'flex',
          flexDirection: 'column',
          animation: 'cartSlideUp 0.3s ease',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ShoppingCart size={20} color="var(--gold)" />
            <h2 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 20,
              color: 'var(--white)',
              margin: 0,
              letterSpacing: 1,
            }}>
              Your Order
            </h2>
            {cart.itemCount > 0 && (
              <span style={{
                background: 'var(--gold)',
                color: 'var(--black)',
                fontSize: 12,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 10,
                minWidth: 20,
                textAlign: 'center',
              }}>
                {cart.itemCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--gray)',
              cursor: 'pointer',
              padding: 6,
              display: 'flex',
            }}
          >
            <X size={22} />
          </button>
        </div>

        {wasCancelled && cart.items.length > 0 && (
          <div style={{
            background: 'rgba(251,191,36,0.08)',
            borderBottom: '1px solid rgba(251,191,36,0.3)',
            padding: '10px 24px',
          }}>
            <p style={{ color: '#fbbf24', fontSize: 12, fontWeight: 600, margin: 0, letterSpacing: 0.3 }}>
              Payment cancelled
            </p>
            <p style={{ color: 'var(--gray)', fontSize: 11, margin: '2px 0 0', lineHeight: 1.5 }}>
              Your cart was preserved. Tap Checkout when you're ready to retry.
            </p>
          </div>
        )}

        {/* Cart Items */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 24px',
        }}>
          {cart.items.length === 0 ? (
            <p style={{ color: 'var(--gray)', fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
              Your cart is empty
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cart.items.map(item => {
                const removedIngredients = item.ingredients.filter(ing => ing.action === 'remove')
                const extraIngredients = item.ingredients.filter(ing => ing.action === 'extra')

                return (
                  <div
                    key={item.cart_id}
                    style={{
                      padding: '14px 16px',
                      background: 'var(--black)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                    }}
                  >
                    {/* Item header row */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                        <span style={{
                          color: 'var(--gold)',
                          fontSize: 13,
                          fontWeight: 700,
                          background: 'rgba(200,168,78,0.15)',
                          padding: '2px 8px',
                          borderRadius: 4,
                        }}>
                          {item.quantity}x
                        </span>
                        <span style={{ color: 'var(--white)', fontSize: 15, fontWeight: 500 }}>
                          {item.item_name}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                        <span style={{ color: 'var(--white)', fontSize: 14, fontWeight: 600, marginRight: 4 }}>
                          ${item.line_total.toFixed(2)}
                        </span>
                        {onEdit && (
                          <button
                            onClick={() => onEdit(item)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--gold)',
                              cursor: 'pointer',
                              padding: 6,
                              display: 'flex',
                              borderRadius: 6,
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(200,168,78,0.12)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            title="Edit item"
                            aria-label="Edit item"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => cart.removeItem(item.cart_id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#cc4444',
                            cursor: 'pointer',
                            padding: 6,
                            display: 'flex',
                            borderRadius: 6,
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(204,68,68,0.12)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          title="Remove item"
                          aria-label="Remove item"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Modifier choices */}
                    {item.modifiers.length > 0 && (
                      <p style={{
                        color: 'var(--gold)',
                        fontSize: 12,
                        margin: '6px 0 0',
                        paddingLeft: 36,
                        lineHeight: 1.4,
                      }}>
                        {item.modifiers.map(mod => mod.modifier_name).join(', ')}
                      </p>
                    )}

                    {/* Removed ingredients */}
                    {removedIngredients.length > 0 && (
                      <p style={{
                        color: '#aa6666',
                        fontSize: 11,
                        margin: '4px 0 0',
                        paddingLeft: 36,
                        lineHeight: 1.4,
                      }}>
                        {removedIngredients.map(ing => `NO ${ing.ingredient_name}`).join(', ')}
                      </p>
                    )}

                    {/* Extra ingredients */}
                    {extraIngredients.length > 0 && (
                      <div style={{ marginTop: 4, paddingLeft: 36 }}>
                        {extraIngredients.map((ing, idx) => (
                          <p key={idx} style={{
                            color: '#66aa66',
                            fontSize: 11,
                            margin: '1px 0',
                            lineHeight: 1.4,
                          }}>
                            EXTRA {ing.ingredient_name}
                            {ing.extra_charge > 0 && ` (+$${ing.extra_charge.toFixed(2)})`}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Special instructions */}
                    {item.special_instructions && (
                      <p style={{
                        color: 'var(--gray)',
                        fontSize: 12,
                        fontStyle: 'italic',
                        margin: '6px 0 0',
                        paddingLeft: 36,
                      }}>
                        {item.special_instructions}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Totals + Checkout */}
        {cart.items.length > 0 && (
          <div style={{
            padding: '16px 24px 24px',
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--gray)', fontSize: 14 }}>Subtotal</span>
                <span style={{ color: 'var(--white)', fontSize: 14 }}>${cart.subtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--gray)', fontSize: 14 }}>Tax (7.75%)</span>
                <span style={{ color: 'var(--white)', fontSize: 14 }}>${cart.tax.toFixed(2)}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: 8,
                borderTop: '1px solid var(--border)',
              }}>
                <span style={{ color: 'var(--white)', fontSize: 16, fontWeight: 700 }}>Total</span>
                <span style={{ color: 'var(--gold)', fontSize: 16, fontWeight: 700 }}>${cart.total.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  background: 'transparent',
                  border: '1px solid rgba(200,168,78,0.4)',
                  borderRadius: 12,
                  color: 'var(--gold)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  letterSpacing: 0.5,
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,168,78,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <ShoppingCart size={14} /> Add more items
              </button>
              <button
                onClick={onCheckout}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: 'var(--gold)',
                  border: 'none',
                  borderRadius: 12,
                  color: 'var(--black)',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: 0.5,
                  transition: 'opacity 0.2s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.9' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                Continue to Checkout
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes cartFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cartSlideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        .cart-drawer-modal::-webkit-scrollbar { display: none; }
        .cart-drawer-modal { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  )
}
