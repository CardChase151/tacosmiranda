import { MenuCategory, MenuItem } from '../../types'
import { useCart } from '../../context/CartContext'
import { Coffee, UtensilsCrossed, X, ArrowRight, ShoppingCart, Plus } from 'lucide-react'

// Order matters — controls the section order in the upsell.
const UPSELL_CATEGORY_NAMES = ['Drinks', 'Sides']
const upsellSortIndex = (name: string) => {
  const idx = UPSELL_CATEGORY_NAMES.indexOf(name)
  return idx === -1 ? 999 : idx
}

// Pure helper called once when the user taps "Continue to Checkout".
// The result is frozen for the upsell session — sections do NOT change as
// the user adds drinks/sides during this same session.
export function computeUpsellMissing(
  categories: MenuCategory[],
  items: MenuItem[],
  cartItems: { menu_item_id: string }[],
  mealType: 'breakfast' | 'lunch_dinner',
): MenuCategory[] {
  const inScope = categories.filter(c => c.meal_type === mealType)
  const cartCategoryIds = new Set(
    cartItems
      .map(ci => items.find(i => i.id === ci.menu_item_id)?.category_id)
      .filter(Boolean) as string[]
  )
  // Don't suggest add-ons to someone who hasn't ordered a main yet.
  const hasMain = inScope.some(
    c => !UPSELL_CATEGORY_NAMES.includes(c.name) && cartCategoryIds.has(c.id)
  )
  if (!hasMain) return []
  return inScope
    .filter(c => UPSELL_CATEGORY_NAMES.includes(c.name) && !cartCategoryIds.has(c.id))
    .sort((a, b) => upsellSortIndex(a.name) - upsellSortIndex(b.name))
}

interface Props {
  open: boolean
  // Frozen list of categories to suggest. Computed once when the upsell opens.
  missingCategories: MenuCategory[]
  items: MenuItem[]
  onSelectItem: (item: MenuItem) => void
  onProceed: () => void
  onClose: () => void
}

export default function OrderUpsell({
  open,
  missingCategories,
  items,
  onSelectItem,
  onProceed,
  onClose,
}: Props) {
  const cart = useCart()

  if (!open || missingCategories.length === 0) return null

  const iconForCategory = (name: string) => {
    if (name === 'Drinks') return <Coffee size={14} />
    if (name === 'Sides') return <UtensilsCrossed size={14} />
    return null
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 350,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        animation: 'upsellFadeIn 0.2s ease',
      }}
    >
      <style>{`
        @keyframes upsellFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes upsellSlideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        .upsell-modal::-webkit-scrollbar { display: none; }
        .upsell-modal { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div
        className="upsell-modal"
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1a1a1a',
          borderRadius: 16,
          width: '100%',
          maxWidth: 520,
          maxHeight: '88vh',
          overflowY: 'auto',
          margin: '0 16px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,168,78,0.15)',
          animation: 'upsellSlideUp 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '24px 24px 16px',
          borderBottom: '1px solid #333',
        }}>
          <div>
            <p style={{
              color: 'var(--gold)', fontSize: 11, fontWeight: 700, letterSpacing: 2.5,
              textTransform: 'uppercase', margin: 0,
            }}>
              Almost there
            </p>
            <h2 style={{
              fontFamily: 'var(--font-heading)', fontSize: 22, color: 'var(--white)',
              margin: '6px 0 0', letterSpacing: 1.5,
            }}>
              Round out your order?
            </h2>
            <p style={{ color: 'var(--gray)', fontSize: 13, margin: '6px 0 0', lineHeight: 1.5 }}>
              Quickly add a drink or side, or skip and head to checkout.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--gray)',
              cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0,
            }}
            aria-label="Back to cart"
          >
            <X size={22} />
          </button>
        </div>

        {/* Sections */}
        <div style={{ flex: 1, padding: '8px 24px' }}>
          {missingCategories.map(cat => {
            const catItems = items
              .filter(i => i.category_id === cat.id)
              .sort((a, b) => a.sort_order - b.sort_order)
            if (catItems.length === 0) return null
            return (
              <div key={cat.id} style={{ marginTop: 16, marginBottom: 8 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginBottom: 10, color: 'var(--gold)',
                  fontSize: 12, fontWeight: 700, letterSpacing: 2,
                  textTransform: 'uppercase',
                }}>
                  {iconForCategory(cat.name)}
                  Add a {cat.name === 'Drinks' ? 'drink' : 'side'}?
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {catItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => onSelectItem(item)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 14px',
                        background: 'var(--dark-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        cursor: 'pointer',
                        width: '100%', textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(200,168,78,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--dark-card)')}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ color: 'var(--white)', fontSize: 14, fontWeight: 500 }}>
                          {item.name}
                        </span>
                        {item.description && (
                          <p style={{ color: 'var(--gray)', fontSize: 11, margin: '3px 0 0', lineHeight: 1.4 }}>
                            {item.description}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12 }}>
                        <span style={{ color: 'var(--gold)', fontSize: 14, fontWeight: 600 }}>
                          ${item.price.toFixed(2)}
                        </span>
                        <span style={{
                          width: 28, height: 28, borderRadius: '50%',
                          border: '1.5px solid var(--gold)', color: 'var(--gold)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Plus size={14} strokeWidth={2.5} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Cart preview + actions */}
        <div style={{
          padding: '16px 24px 24px',
          borderTop: '1px solid #333',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'rgba(200,168,78,0.06)',
            border: '1px solid rgba(200,168,78,0.25)',
            borderRadius: 10,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={14} color="var(--gold)" />
              <span style={{ color: 'var(--white)', fontSize: 13, fontWeight: 600 }}>
                {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'} in cart
              </span>
            </span>
            <span style={{ color: 'var(--gold)', fontSize: 14, fontWeight: 700 }}>
              ${cart.total.toFixed(2)}
            </span>
          </div>

          <button
            onClick={onProceed}
            style={{
              width: '100%', padding: '14px 24px',
              background: 'var(--gold)', border: 'none', borderRadius: 12,
              color: '#000', fontSize: 16, fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              letterSpacing: 0.5,
            }}
          >
            Continue to Checkout <ArrowRight size={16} />
          </button>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '10px 20px',
              background: 'transparent',
              border: '1px solid rgba(200,168,78,0.3)',
              borderRadius: 12,
              color: 'var(--gray)',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}
          >
            Back to Cart
          </button>
        </div>
      </div>
    </div>
  )
}
