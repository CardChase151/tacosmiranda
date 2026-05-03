import { useState, useMemo, useCallback } from 'react'
import {
  MenuItem,
  ModifierGroup,
  Modifier,
  MenuItemModifierGroup,
  Ingredient,
  MenuItemIngredient,
  CartItem,
  CartItemModifier,
  CartItemIngredient,
} from '../../types'
import { useCart } from '../../context/CartContext'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { X, Plus, Minus, Check, ShoppingCart } from 'lucide-react'

interface Props {
  item: MenuItem
  modifierGroups: Array<{
    group: ModifierGroup
    modifiers: Modifier[]
    link: MenuItemModifierGroup
  }>
  itemIngredients: Array<{
    ingredient: Ingredient
    link: MenuItemIngredient
  }>
  // If provided, the modal opens in EDIT mode pre-filled from this cart entry.
  editingCartItem?: CartItem
  onAdd: (data: {
    menu_item_id: string
    item_name: string
    unit_price: number
    quantity: number
    modifiers: CartItemModifier[]
    ingredients: CartItemIngredient[]
    special_instructions: string
  }) => void
  // Called when saving in edit mode.
  onUpdate?: (cartId: string, data: Partial<CartItem>) => void
  // Called when the user taps the cart preview chip to review their cart.
  onViewCart?: () => void
  // If true, the primary button adds + closes immediately instead of staying open.
  // Used when the customizer is launched from a focused flow (e.g. the upsell).
  closeOnAdd?: boolean
  // Optional override for the secondary back-button label (defaults to "Back to Menu").
  closeButtonLabel?: string
  onClose: () => void
}

export default function ItemCustomizer({ item, modifierGroups, itemIngredients, editingCartItem, onAdd, onUpdate, onViewCart, closeOnAdd, closeButtonLabel, onClose }: Props) {
  const isEditing = !!editingCartItem
  const cart = useCart()
  useBodyScrollLock(true)

  // Build initial modifier selections (groupId -> [modifierIds]) from cart item if editing.
  const buildInitialModifiers = useCallback(() => {
    const initial: Record<string, string[]> = {}
    modifierGroups.forEach(mg => {
      const modIdsInGroup = new Set(mg.modifiers.map(m => m.id))
      if (editingCartItem) {
        const selected = editingCartItem.modifiers
          .map(m => m.modifier_id)
          .filter(id => modIdsInGroup.has(id))
        initial[mg.link.modifier_group_id] = selected
      } else if (mg.link.is_required && mg.modifiers.length > 0) {
        initial[mg.link.modifier_group_id] = [mg.modifiers[0].id]
      } else {
        initial[mg.link.modifier_group_id] = []
      }
    })
    return initial
  }, [modifierGroups, editingCartItem])

  const buildInitialRemoved = useCallback(() => {
    const r: Record<string, boolean> = {}
    if (editingCartItem) {
      editingCartItem.ingredients.filter(i => i.action === 'remove').forEach(i => {
        if (i.ingredient_id) r[i.ingredient_id] = true
      })
    }
    return r
  }, [editingCartItem])

  const buildInitialExtras = useCallback(() => {
    const e: Record<string, boolean> = {}
    if (editingCartItem) {
      editingCartItem.ingredients.filter(i => i.action === 'extra').forEach(i => {
        if (i.ingredient_id) e[i.ingredient_id] = true
      })
    }
    return e
  }, [editingCartItem])

  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>(buildInitialModifiers)
  const [removedIngredients, setRemovedIngredients] = useState<Record<string, boolean>>(buildInitialRemoved)
  const [extraIngredients, setExtraIngredients] = useState<Record<string, boolean>>(buildInitialExtras)
  const [specialInstructions, setSpecialInstructions] = useState(editingCartItem?.special_instructions || '')
  const [quantity, setQuantity] = useState(editingCartItem?.quantity || 1)
  const [justAdded, setJustAdded] = useState(false)

  const resetForAnother = () => {
    setSelectedModifiers(buildInitialModifiers())
    setRemovedIngredients({})
    setExtraIngredients({})
    setSpecialInstructions('')
    setQuantity(1)
  }

  const requiredGroups = modifierGroups.filter(mg => mg.link.is_required)
  const optionalGroups = modifierGroups.filter(mg => !mg.link.is_required)

  // Group ingredients by category
  const ingredientsByCategory = useMemo(() => {
    const grouped: Record<string, Array<{ ingredient: Ingredient; link: MenuItemIngredient }>> = {}
    itemIngredients.forEach(ii => {
      const cat = ii.ingredient.category || 'Other'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(ii)
    })
    // Sort within each category by sort_order
    Object.values(grouped).forEach(arr => arr.sort((a, b) => a.link.sort_order - b.link.sort_order))
    return grouped
  }, [itemIngredients])

  const handleRequiredModifier = (groupId: string, modifierId: string) => {
    setSelectedModifiers(prev => ({ ...prev, [groupId]: [modifierId] }))
  }

  const handleOptionalModifier = (groupId: string, modifierId: string) => {
    setSelectedModifiers(prev => {
      const current = prev[groupId] || []
      if (current.includes(modifierId)) {
        return { ...prev, [groupId]: current.filter(id => id !== modifierId) }
      }
      return { ...prev, [groupId]: [...current, modifierId] }
    })
  }

  const toggleRemoveIngredient = (ingredientId: string) => {
    setRemovedIngredients(prev => {
      const next = { ...prev }
      if (next[ingredientId]) {
        delete next[ingredientId]
      } else {
        next[ingredientId] = true
        // If removing, also remove extra
        setExtraIngredients(p => {
          const n = { ...p }
          delete n[ingredientId]
          return n
        })
      }
      return next
    })
  }

  const toggleExtraIngredient = (ingredientId: string) => {
    setExtraIngredients(prev => {
      const next = { ...prev }
      if (next[ingredientId]) {
        delete next[ingredientId]
      } else {
        next[ingredientId] = true
      }
      return next
    })
  }

  // Build selected modifiers list
  const selectedMods: CartItemModifier[] = useMemo(() => {
    const result: CartItemModifier[] = []
    modifierGroups.forEach(mg => {
      const selected = selectedModifiers[mg.link.modifier_group_id] || []
      selected.forEach(modId => {
        const mod = mg.modifiers.find(m => m.id === modId)
        if (mod) {
          result.push({
            modifier_id: mod.id,
            modifier_name: mod.name,
            upcharge: mod.upcharge,
          })
        }
      })
    })
    return result
  }, [modifierGroups, selectedModifiers])

  // Build ingredient changes list
  const ingredientChanges: CartItemIngredient[] = useMemo(() => {
    const result: CartItemIngredient[] = []
    itemIngredients.forEach(ii => {
      if (removedIngredients[ii.ingredient.id]) {
        result.push({
          ingredient_id: ii.ingredient.id,
          ingredient_name: ii.ingredient.name,
          action: 'remove',
          extra_charge: 0,
        })
      } else if (extraIngredients[ii.ingredient.id]) {
        result.push({
          ingredient_id: ii.ingredient.id,
          ingredient_name: ii.ingredient.name,
          action: 'extra',
          extra_charge: ii.link.extra_charge,
        })
      }
    })
    return result
  }, [itemIngredients, removedIngredients, extraIngredients])

  // Calculate total
  const modifierUpcharges = selectedMods.reduce((sum, m) => sum + m.upcharge, 0)
  const extraCharges = ingredientChanges
    .filter(ic => ic.action === 'extra')
    .reduce((sum, ic) => sum + ic.extra_charge, 0)
  const lineTotal = (item.price + modifierUpcharges + extraCharges) * quantity

  const buildPayload = () => ({
    menu_item_id: item.id,
    item_name: item.name,
    unit_price: item.price,
    quantity,
    modifiers: selectedMods,
    ingredients: ingredientChanges,
    special_instructions: specialInstructions.trim(),
  })

  const handleAdd = () => {
    if (isEditing && editingCartItem && onUpdate) {
      onUpdate(editingCartItem.cart_id, buildPayload())
    } else {
      onAdd(buildPayload())
    }
    onClose()
  }

  const handleAddAnother = () => {
    onAdd(buildPayload())
    if (closeOnAdd) {
      // Focused flow (e.g. upsell): add + return to wherever we came from.
      onClose()
      return
    }
    resetForAnother()
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 1600)
    // intentionally NOT calling onClose — modal stays open for next customization
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        .item-customizer-modal::-webkit-scrollbar { display: none; }
        .item-customizer-modal { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div
        className="item-customizer-modal"
        style={{
          background: '#1a1a1a',
          borderRadius: 16,
          width: '100%',
          maxWidth: 520,
          maxHeight: '85vh',
          overflowY: 'auto',
          position: 'relative',
          margin: '0 16px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,168,78,0.15)',
          animation: 'slideUp 0.3s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '24px 24px 16px',
          borderBottom: '1px solid #333',
        }}>
          <div>
            <h2 style={{
              fontSize: 22,
              color: '#fff',
              margin: 0,
              fontWeight: 700,
              letterSpacing: 0.5,
            }}>
              {item.name}
            </h2>
            <p style={{ color: '#C8A84E', fontSize: 16, fontWeight: 600, margin: '4px 0 0' }}>
              ${item.price.toFixed(2)}
            </p>
            {item.description && (
              <p style={{ color: '#888', fontSize: 13, margin: '8px 0 0', lineHeight: 1.4 }}>
                {item.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginRight: -8,
            }}
          >
            <X size={22} />
          </button>
        </div>

        <div style={{ padding: '16px 24px' }}>
          {/* Section 1: Required Choices */}
          {requiredGroups.length > 0 && requiredGroups.map(mg => {
            const groupSelected = selectedModifiers[mg.link.modifier_group_id] || []
            return (
              <div key={mg.link.id} style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, letterSpacing: 0.5 }}>
                    {mg.group.display_name}
                  </span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#C8A84E',
                    background: 'rgba(200,168,78,0.15)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}>
                    Required
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {mg.modifiers.map(mod => {
                    const isSelected = groupSelected.includes(mod.id)
                    return (
                      <button
                        key={mod.id}
                        onClick={() => handleRequiredModifier(mg.link.modifier_group_id, mod.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: isSelected ? 'rgba(200,168,78,0.1)' : 'transparent',
                          border: isSelected ? '1px solid #C8A84E' : '1px solid #333',
                          borderRadius: 8,
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            border: isSelected ? '2px solid #C8A84E' : '2px solid #888',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {isSelected && (
                              <div style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: '#C8A84E',
                              }} />
                            )}
                          </div>
                          <span style={{ color: '#fff', fontSize: 14 }}>{mod.name}</span>
                        </div>
                        {mod.upcharge > 0 && (
                          <span style={{ color: '#C8A84E', fontSize: 13, fontWeight: 500 }}>
                            +${mod.upcharge.toFixed(2)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Section 2: Optional Add-ons */}
          {optionalGroups.length > 0 && (
            <>
              {optionalGroups.map(mg => {
                const groupSelected = selectedModifiers[mg.link.modifier_group_id] || []
                return (
                  <div key={mg.link.id} style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, letterSpacing: 0.5 }}>
                        {mg.group.display_name}
                      </span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#888',
                        background: 'rgba(255,255,255,0.05)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                      }}>
                        Optional
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {mg.modifiers.map(mod => {
                        const isSelected = groupSelected.includes(mod.id)
                        return (
                          <button
                            key={mod.id}
                            onClick={() => handleOptionalModifier(mg.link.modifier_group_id, mod.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              background: isSelected ? 'rgba(200,168,78,0.1)' : 'transparent',
                              border: isSelected ? '1px solid #C8A84E' : '1px solid #333',
                              borderRadius: 8,
                              cursor: 'pointer',
                              width: '100%',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 18,
                                height: 18,
                                borderRadius: 4,
                                border: isSelected ? '2px solid #C8A84E' : '2px solid #888',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                background: isSelected ? '#C8A84E' : 'transparent',
                              }}>
                                {isSelected && <Check size={12} color="#000" strokeWidth={3} />}
                              </div>
                              <span style={{ color: '#fff', fontSize: 14 }}>{mod.name}</span>
                            </div>
                            {mod.upcharge > 0 && (
                              <span style={{ color: '#C8A84E', fontSize: 13, fontWeight: 500 }}>
                                +${mod.upcharge.toFixed(2)}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* Section 3: Included Ingredients */}
          {itemIngredients.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{
                color: '#C8A84E',
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: 0.5,
                marginBottom: 14,
                textTransform: 'uppercase',
              }}>
                Included Ingredients
              </div>

              {Object.entries(ingredientsByCategory).map(([category, items]) => (
                <div key={category} style={{ marginBottom: 16 }}>
                  <div style={{
                    color: '#888',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: 1,
                    textTransform: 'capitalize',
                    marginBottom: 8,
                  }}>
                    {category}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {items.map(({ ingredient, link }) => {
                      const isRemoved = !!removedIngredients[ingredient.id]
                      const isExtra = !!extraIngredients[ingredient.id]

                      return (
                        <div
                          key={ingredient.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: '#222',
                            borderRadius: 8,
                            opacity: isRemoved ? 0.4 : 1,
                            transition: 'opacity 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {/* Include/remove checkbox */}
                            {link.is_removable ? (
                              <button
                                onClick={() => toggleRemoveIngredient(ingredient.id)}
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 4,
                                  border: isRemoved ? '2px solid #555' : '2px solid #C8A84E',
                                  background: isRemoved ? 'transparent' : '#C8A84E',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                  padding: 0,
                                }}
                              >
                                {!isRemoved && <Check size={12} color="#000" strokeWidth={3} />}
                              </button>
                            ) : (
                              <div style={{
                                width: 20,
                                height: 20,
                                borderRadius: 4,
                                border: '2px solid #C8A84E',
                                background: '#C8A84E',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                opacity: 0.5,
                              }}>
                                <Check size={12} color="#000" strokeWidth={3} />
                              </div>
                            )}
                            <span style={{
                              color: '#fff',
                              fontSize: 14,
                              textDecoration: isRemoved ? 'line-through' : 'none',
                            }}>
                              {ingredient.name}
                            </span>
                          </div>

                          {/* Extra toggle */}
                          {link.can_add_extra && link.extra_charge > 0 && !isRemoved && (
                            <button
                              onClick={() => toggleExtraIngredient(ingredient.id)}
                              style={{
                                padding: '3px 10px',
                                borderRadius: 12,
                                border: isExtra ? '1px solid #C8A84E' : '1px solid #555',
                                background: isExtra ? 'rgba(200,168,78,0.2)' : 'transparent',
                                color: isExtra ? '#C8A84E' : '#888',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Extra +${link.extra_charge.toFixed(2)}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Special Instructions */}
          <div style={{ marginBottom: 24 }}>
            <label style={{
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 0.5,
              display: 'block',
              marginBottom: 8,
            }}>
              Special Instructions
            </label>
            <textarea
              value={specialInstructions}
              onChange={e => setSpecialInstructions(e.target.value)}
              placeholder="Any special requests..."
              rows={3}
              style={{
                width: '100%',
                background: '#111',
                border: '1px solid #333',
                borderRadius: 8,
                color: '#fff',
                fontSize: 14,
                padding: '10px 14px',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Quantity Selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            marginBottom: 24,
          }}>
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#111',
                border: '1px solid #333',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <Minus size={18} />
            </button>
            <span style={{
              color: '#fff',
              fontSize: 20,
              fontWeight: 700,
              minWidth: 32,
              textAlign: 'center',
            }}>
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(q => q + 1)}
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#111',
                border: '1px solid #333',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* Cart Preview Chip */}
        {cart.itemCount > 0 && (
          <div style={{ padding: '0 24px 12px' }}>
            <button
              onClick={onViewCart}
              disabled={!onViewCart}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 16px',
                background: justAdded ? 'rgba(74,222,128,0.10)' : 'rgba(200,168,78,0.06)',
                border: `1px solid ${justAdded ? 'rgba(74,222,128,0.4)' : 'rgba(200,168,78,0.25)'}`,
                borderRadius: 12,
                cursor: onViewCart ? 'pointer' : 'default',
                transition: 'all 0.25s ease',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShoppingCart size={16} color={justAdded ? '#4ade80' : '#C8A84E'} />
                <span style={{
                  color: justAdded ? '#4ade80' : '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                }}>
                  {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'} in cart
                </span>
              </span>
              <span style={{
                color: justAdded ? '#4ade80' : '#C8A84E',
                fontSize: 14,
                fontWeight: 700,
              }}>
                ${cart.total.toFixed(2)}
              </span>
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={isEditing ? handleAdd : handleAddAnother}
            style={{
              width: '100%',
              padding: '14px 24px',
              background: justAdded && !isEditing ? '#4ade80' : '#C8A84E',
              border: 'none',
              borderRadius: 12,
              color: '#000',
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              letterSpacing: 0.5,
              transition: 'background 0.25s ease',
            }}
          >
            {isEditing ? (
              <>Update Order - ${lineTotal.toFixed(2)}</>
            ) : justAdded ? (
              <><Check size={18} /> Added to Cart</>
            ) : (
              <><Plus size={18} /> Add to Cart - ${lineTotal.toFixed(2)}</>
            )}
          </button>
          {!isEditing && (
            <button
              onClick={onClose}
              style={{
                width: '100%',
                padding: '12px 20px',
                background: 'transparent',
                border: '1px solid rgba(200,168,78,0.4)',
                borderRadius: 12,
                color: '#C8A84E',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                letterSpacing: 0.5,
                transition: 'all 0.2s',
              }}
            >
              {closeButtonLabel || 'Back to Menu'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
