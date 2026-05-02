import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../config/supabase'
import {
  MenuCategory,
  MenuItem,
  ModifierGroup,
  Modifier,
  MenuItemModifierGroup,
  Ingredient,
  MenuItemIngredient,
  CartItem,
  CartItemModifier,
  CartItemIngredient,
} from '../types'
import { useCart, CartProvider } from '../context/CartContext'
import ItemCustomizer from '../components/order/ItemCustomizer'
import CartDrawer from '../components/order/CartDrawer'
import OrderCheckout from '../components/order/OrderCheckout'
import OrderUpsell, { computeUpsellMissing } from '../components/order/OrderUpsell'
import { getOpenStatus, BusinessHourRow, OpenStatus } from '../utils/businessHours'
import { useAuth } from '../context/AuthContext'
import { ShoppingCart, Undo2, Redo2, ArrowLeft, Plus, Moon } from 'lucide-react'

function OrderContent() {
  const cart = useCart()
  const { isAdmin } = useAuth()
  const [openStatus, setOpenStatus] = useState<OpenStatus | null>(null)
  const [orderingEnabled, setOrderingEnabled] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const wasCancelled = searchParams.get('cancelled') === 'true'
  const dismissCancelled = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('cancelled')
    setSearchParams(next, { replace: true })
  }

  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([])
  const [allModifiers, setAllModifiers] = useState<Modifier[]>([])
  const [menuItemModifierGroups, setMenuItemModifierGroups] = useState<MenuItemModifierGroup[]>([])
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([])
  const [menuItemIngredients, setMenuItemIngredients] = useState<MenuItemIngredient[]>([])
  const [loading, setLoading] = useState(true)

  const [mealType, setMealType] = useState<'breakfast' | 'lunch_dinner'>(() => {
    const pstHour = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false })
    const hour = parseInt(pstHour, 10)
    // Before 10am only breakfast is available, so default to it.
    // After 10am default to lunch/dinner (breakfast still selectable all day).
    return hour < 10 ? 'breakfast' : 'lunch_dinner'
  })

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [upsellOpen, setUpsellOpen] = useState(false)
  // Captured once when the upsell opens — list does NOT re-compute as the user
  // adds drinks/sides during this session. Cleared when the upsell closes.
  const [upsellSnapshot, setUpsellSnapshot] = useState<MenuCategory[]>([])
  // True when the customizer was launched from the upsell flow — so closing it returns to upsell.
  const [returnToUpsell, setReturnToUpsell] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [reorderLoaded, setReorderLoaded] = useState(false)

  const handleEditCartItem = (cartItem: CartItem) => {
    const menu = items.find(i => i.id === cartItem.menu_item_id)
    if (!menu) return
    setEditingCartItem(cartItem)
    setSelectedItem(menu)
    setCartOpen(false)
  }

  const closeCustomizer = () => {
    setSelectedItem(null)
    setEditingCartItem(null)
    if (returnToUpsell) {
      setReturnToUpsell(false)
      // Reopen the upsell with the same frozen suggestion list.
      setUpsellOpen(true)
    }
  }

  const handleUpsellSelect = (item: MenuItem) => {
    setUpsellOpen(false)
    setReturnToUpsell(true)
    setSelectedItem(item)
  }

  // Pick up reorder items from MyOrders page
  useEffect(() => {
    if (reorderLoaded) return
    const stored = sessionStorage.getItem('reorder_items')
    if (stored) {
      try {
        const items = JSON.parse(stored)
        items.forEach((item: any) => cart.addItem(item))
        sessionStorage.removeItem('reorder_items')
        // If "order again" was clicked, go straight to checkout
        if (sessionStorage.getItem('reorder_checkout')) {
          sessionStorage.removeItem('reorder_checkout')
          setCheckoutOpen(true)
        }
      } catch { /* ignore parse errors */ }
    }
    setReorderLoaded(true)
  }, [reorderLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async () => {
    const [catRes, itemRes, mgRes, modRes, linkRes, ingRes, miiRes, hoursRes, settingsRes] = await Promise.all([
      supabase.from('menu_categories').select('*').order('sort_order'),
      supabase.from('menu_items').select('*').eq('is_86', false).order('sort_order'),
      supabase.from('modifier_groups').select('*').order('sort_order'),
      supabase.from('modifiers').select('*').order('sort_order'),
      supabase.from('menu_item_modifier_groups').select('*').order('sort_order'),
      supabase.from('ingredients').select('*').order('sort_order'),
      supabase.from('menu_item_ingredients').select('*').order('sort_order'),
      supabase.from('business_hours').select('*').order('day_order'),
      supabase.from('site_settings').select('ordering_enabled').eq('id', 'main').maybeSingle(),
    ])
    if (catRes.data) setCategories(catRes.data)
    if (itemRes.data) setItems(itemRes.data)
    if (mgRes.data) setModifierGroups(mgRes.data)
    if (modRes.data) setAllModifiers(modRes.data)
    if (linkRes.data) setMenuItemModifierGroups(linkRes.data)
    if (ingRes.data) setAllIngredients(ingRes.data)
    if (miiRes.data) setMenuItemIngredients(miiRes.data)
    if (hoursRes.data) setOpenStatus(getOpenStatus(hoursRes.data as BusinessHourRow[]))
    setOrderingEnabled(settingsRes.data?.ordering_enabled ?? true)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const isBreakfast = mealType === 'breakfast'
  const filteredCategories = categories.filter(c => c.meal_type === mealType)

  const getItemModifierGroups = (itemId: string) => {
    return menuItemModifierGroups
      .filter(link => link.menu_item_id === itemId)
      .map(link => ({
        group: modifierGroups.find(g => g.id === link.modifier_group_id)!,
        modifiers: allModifiers.filter(m => m.modifier_group_id === link.modifier_group_id),
        link,
      }))
      .filter(x => x.group)
  }

  const getItemIngredients = (itemId: string) => {
    return menuItemIngredients
      .filter(link => link.menu_item_id === itemId)
      .map(link => ({
        ingredient: allIngredients.find(i => i.id === link.ingredient_id)!,
        link,
      }))
      .filter(x => x.ingredient)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--gray)', fontSize: 14 }}>Loading menu...</p>
      </div>
    )
  }

  // Hard close: ordering disabled (admin override) OR outside business hours.
  // Admins can always proceed so they can test/place phone orders.
  const closed = !isAdmin && (!orderingEnabled || (openStatus && !openStatus.isOpen))
  if (closed) {
    return (
      <div style={{ padding: '40px 24px 120px', maxWidth: 540, margin: '0 auto' }}>
        <Helmet>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: 24 }}>
          <Link to="/" style={{ position: 'absolute', left: 0, color: 'var(--gold)', display: 'flex', alignItems: 'center', textDecoration: 'none', fontSize: 14, gap: 4 }}>
            <ArrowLeft size={18} /> Home
          </Link>
        </div>
        <div style={{
          background: 'linear-gradient(180deg, rgba(200,168,78,0.1) 0%, rgba(200,168,78,0.03) 100%)',
          border: '1px solid rgba(200,168,78,0.3)',
          borderRadius: 16,
          padding: '40px 24px',
          textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(200,168,78,0.15)',
            border: '1px solid rgba(200,168,78,0.4)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 18,
          }}>
            <Moon size={26} color="var(--gold)" />
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, color: 'var(--white)', letterSpacing: 2, margin: '0 0 10px' }}>
            We're closed right now
          </h2>
          <p style={{ color: 'var(--gray)', fontSize: 14, margin: '0 0 18px', lineHeight: 1.6 }}>
            {!orderingEnabled
              ? 'Online ordering is paused. Please call us if you need anything.'
              : openStatus?.nextOpenLabel
                ? <>Online ordering reopens <strong style={{ color: 'var(--gold)' }}>{openStatus.nextOpenLabel}</strong>.</>
                : 'Please come back during business hours.'}
          </p>
          {openStatus?.todayHoursLabel && (
            <p style={{ color: 'var(--gray)', fontSize: 12, opacity: 0.8, margin: '0 0 18px' }}>
              Today's hours: {openStatus.todayHoursLabel}
            </p>
          )}
          <a href="tel:6578454011" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '12px 24px',
            background: 'var(--gold)', color: 'var(--black)',
            borderRadius: 10, fontSize: 14, fontWeight: 700, letterSpacing: 0.5,
            textDecoration: 'none',
          }}>
            Call (657) 845-4011
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '40px 24px 120px', maxWidth: 600, margin: '0 auto' }}>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      {isAdmin && openStatus && !openStatus.isOpen && (
        <div style={{
          background: 'rgba(251,191,36,0.10)',
          border: '1px solid rgba(251,191,36,0.4)',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 16,
        }}>
          <p style={{ color: '#fbbf24', fontSize: 12, margin: 0, fontWeight: 600 }}>
            Outside business hours — admin preview only. Customers see a closed message.
          </p>
        </div>
      )}
      {isAdmin && !orderingEnabled && (
        <div style={{
          background: 'rgba(239,68,68,0.10)',
          border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 16,
        }}>
          <p style={{ color: '#fca5a5', fontSize: 12, margin: 0, fontWeight: 600 }}>
            Online ordering is PAUSED for customers (admin override). Toggle in admin settings.
          </p>
        </div>
      )}

      {wasCancelled && (
        <div style={{
          background: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div>
            <p style={{ color: '#fbbf24', fontSize: 13, fontWeight: 600, margin: 0, letterSpacing: 0.3 }}>
              Payment cancelled
            </p>
            <p style={{ color: 'var(--gray)', fontSize: 12, margin: '2px 0 0', lineHeight: 1.5 }}>
              Your cart is still here. Tap Place Order again whenever you're ready.
            </p>
          </div>
          <button
            onClick={dismissCancelled}
            style={{
              background: 'none', border: 'none', color: 'var(--gray)',
              cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1, flexShrink: 0,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: 8 }}>
        <Link
          to="/"
          style={{
            position: 'absolute',
            left: 0,
            color: 'var(--gold)',
            display: 'flex',
            alignItems: 'center',
            textDecoration: 'none',
            fontSize: 14,
            gap: 4,
          }}
        >
          <ArrowLeft size={18} /> Back
        </Link>
        <h1 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 40,
          color: 'var(--white)',
          textAlign: 'center',
          letterSpacing: 4,
        }}>
          Order Online
        </h1>
      </div>

      {/* Meal Type Toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24, marginBottom: 32 }}>
        <div style={{
          display: 'flex',
          background: 'var(--dark-card)',
          borderRadius: 50,
          padding: 4,
          border: '1px solid var(--border)',
        }}>
          <button
            onClick={() => setMealType('breakfast')}
            style={{
              padding: '10px 28px',
              borderRadius: 50,
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 0.5,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              background: isBreakfast ? 'var(--gold)' : 'transparent',
              color: isBreakfast ? 'var(--black)' : 'var(--gray)',
            }}
          >
            Breakfast
            <span style={{ display: 'block', fontSize: 10, fontWeight: 400, opacity: 0.7, marginTop: 1 }}>
              Served all day
            </span>
          </button>
          <button
            onClick={() => setMealType('lunch_dinner')}
            style={{
              padding: '10px 28px',
              borderRadius: 50,
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 0.5,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              background: !isBreakfast ? 'var(--gold)' : 'transparent',
              color: !isBreakfast ? 'var(--black)' : 'var(--gray)',
            }}
          >
            Lunch & Dinner
            <span style={{ display: 'block', fontSize: 10, fontWeight: 400, opacity: 0.7, marginTop: 1 }}>
              Starting at 10am
            </span>
          </button>
        </div>
      </div>

      {/* Categories + Items */}
      {filteredCategories.map(cat => {
        const catItems = items.filter(i => i.category_id === cat.id)
        if (catItems.length === 0) return null
        return (
          <div key={cat.id} style={{ marginBottom: 40 }}>
            <h2 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 22,
              color: 'var(--gold)',
              letterSpacing: 2,
              textTransform: 'uppercase',
              marginBottom: 16,
              paddingBottom: 8,
              borderBottom: '1px solid var(--border)',
            }}>
              {cat.name}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {catItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 16px',
                    background: 'var(--dark-card)',
                    border: '1px solid var(--border)',
                    borderTop: '3px solid var(--gold)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    width: '100%',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(200,168,78,0.08)'
                    const plus = e.currentTarget.querySelector('[data-plus]') as HTMLElement | null
                    if (plus) {
                      plus.style.background = 'var(--gold)'
                      plus.style.color = 'var(--black)'
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--dark-card)'
                    const plus = e.currentTarget.querySelector('[data-plus]') as HTMLElement | null
                    if (plus) {
                      plus.style.background = 'transparent'
                      plus.style.color = 'var(--gold)'
                    }
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: 'var(--white)', fontSize: 15, fontWeight: 500 }}>
                      {item.name}
                    </span>
                    {item.description && (
                      <p style={{ color: 'var(--gray)', fontSize: 12, margin: '4px 0 0' }}>
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 16 }}>
                    <span style={{
                      color: 'var(--gold)',
                      fontSize: 15,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>
                      ${item.price.toFixed(2)}
                    </span>
                    <span
                      data-plus
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        border: '1.5px solid var(--gold)',
                        background: 'transparent',
                        color: 'var(--gold)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                      }}
                      aria-hidden="true"
                    >
                      <Plus size={16} strokeWidth={2.5} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })}

      {/* Item Customizer Modal */}
      {selectedItem && (
        <ItemCustomizer
          key={editingCartItem?.cart_id || selectedItem.id}
          item={selectedItem}
          modifierGroups={getItemModifierGroups(selectedItem.id)}
          itemIngredients={getItemIngredients(selectedItem.id)}
          editingCartItem={editingCartItem || undefined}
          onAdd={(cartItem) => cart.addItem(cartItem)}
          onUpdate={(cartId, updates) => cart.updateItem(cartId, updates)}
          onViewCart={() => setCartOpen(true)}
          closeOnAdd={returnToUpsell}
          closeButtonLabel={returnToUpsell ? 'Back to Suggestions' : undefined}
          onClose={closeCustomizer}
        />
      )}

      {/* Checkout */}
      {checkoutOpen && (
        <OrderCheckout onBack={() => setCheckoutOpen(false)} />
      )}

      {/* Pre-checkout Upsell */}
      <OrderUpsell
        open={upsellOpen && !checkoutOpen && !selectedItem}
        missingCategories={upsellSnapshot}
        items={items}
        onSelectItem={handleUpsellSelect}
        onProceed={() => {
          setUpsellOpen(false)
          setUpsellSnapshot([])
          setCheckoutOpen(true)
        }}
        onClose={() => {
          setUpsellOpen(false)
          setUpsellSnapshot([])
          setCartOpen(true)
        }}
      />

      {/* Cart Drawer */}
      {!checkoutOpen && (
        <CartDrawer
          isOpen={cartOpen}
          onClose={() => setCartOpen(false)}
          onCheckout={() => {
            // Proceeding to checkout — also dismiss any in-progress customizer.
            closeCustomizer()
            setCartOpen(false)
            // Snapshot what's missing right now; the list is FROZEN for this session.
            const missing = computeUpsellMissing(categories, items, cart.items, mealType)
            if (missing.length > 0) {
              setUpsellSnapshot(missing)
              setUpsellOpen(true)
            } else {
              setCheckoutOpen(true)
            }
          }}
          onEdit={handleEditCartItem}
          hasActiveCustomizer={!!selectedItem}
        />
      )}

      {/* Floating Cart Bar */}
      {cart.itemCount > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          // Clear iPhone home indicator using safe-area insets.
          padding: '0 24px max(24px, env(safe-area-inset-bottom))',
          pointerEvents: 'none',
        }}>
          <div style={{
            maxWidth: 600,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            pointerEvents: 'auto',
          }}>
            {/* Undo */}
            <button
              onClick={cart.undo}
              disabled={!cart.canUndo}
              style={{
                minWidth: 56,
                height: 52,
                padding: '6px 8px',
                borderRadius: 14,
                background: 'var(--dark-card)',
                border: '1px solid var(--border)',
                color: cart.canUndo ? 'var(--gold)' : 'var(--gray)',
                cursor: cart.canUndo ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                opacity: cart.canUndo ? 1 : 0.4,
                flexShrink: 0,
              }}
              title="Undo last item"
              aria-label="Undo last item"
            >
              <Undo2 size={16} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', lineHeight: 1 }}>
                Undo
              </span>
            </button>

            {/* Main Cart Bar */}
            <button
              onClick={() => setCartOpen(true)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                background: 'var(--gold)',
                border: 'none',
                borderRadius: 12,
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(200,168,78,0.4)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShoppingCart size={20} color="var(--black)" />
                <span style={{
                  background: 'var(--black)',
                  color: 'var(--gold)',
                  borderRadius: '50%',
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                }}>
                  {cart.itemCount}
                </span>
                <span style={{ color: 'var(--black)', fontSize: 15, fontWeight: 600 }}>
                  View Cart
                </span>
              </div>
              <span style={{ color: 'var(--black)', fontSize: 16, fontWeight: 700 }}>
                ${cart.total.toFixed(2)}
              </span>
            </button>

            {/* Redo */}
            <button
              onClick={cart.redo}
              disabled={!cart.canRedo}
              style={{
                minWidth: 56,
                height: 52,
                padding: '6px 8px',
                borderRadius: 14,
                background: 'var(--dark-card)',
                border: '1px solid var(--border)',
                color: cart.canRedo ? 'var(--gold)' : 'var(--gray)',
                cursor: cart.canRedo ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                opacity: cart.canRedo ? 1 : 0.4,
                flexShrink: 0,
              }}
              title="Redo last item"
              aria-label="Redo last item"
            >
              <Redo2 size={16} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', lineHeight: 1 }}>
                Redo
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OrderOnline() {
  return (
    <CartProvider>
      <OrderContent />
    </CartProvider>
  )
}
