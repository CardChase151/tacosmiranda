import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'
import { CartItem, CartItemModifier, CartItemIngredient } from '../types'

interface CartState {
  items: CartItem[]
}

interface CartContextType {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'cart_id' | 'line_total'>) => void
  updateItem: (cartId: string, updates: Partial<CartItem>) => void
  removeItem: (cartId: string) => void
  clearCart: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  subtotal: number
  tax: number
  total: number
  itemCount: number
}

const CartContext = createContext<CartContextType | null>(null)

const TAX_RATE = 0.0775
const STORAGE_KEY = 'tm_cart'

function calcLineTotal(item: { unit_price: number; quantity: number; modifiers: CartItemModifier[]; ingredients: CartItemIngredient[] }) {
  const modUpcharges = item.modifiers.reduce((sum, m) => sum + m.upcharge, 0)
  const ingUpcharges = item.ingredients.filter(i => i.action === 'extra').reduce((sum, i) => sum + i.extra_charge, 0)
  return Math.round(((item.unit_price + modUpcharges + ingUpcharges) * item.quantity) * 100) / 100
}

function loadCart(): { history: CartState[]; index: number } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.history?.length > 0) return parsed
    }
  } catch { /* ignore */ }
  return { history: [{ items: [] }], index: 0 }
}

function saveCart(history: CartState[], index: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ history, index }))
  } catch { /* ignore quota errors */ }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const initial = loadCart()
  const [history, setHistory] = useState<CartState[]>(initial.history)
  const [historyIndex, setHistoryIndex] = useState(initial.index)
  const skipSave = useRef(true)

  const current = history[historyIndex]

  // Persist to localStorage on every change (skip initial load)
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    saveCart(history, historyIndex)
  }, [history, historyIndex])

  const pushState = useCallback((newItems: CartItem[]) => {
    const newState = { items: newItems }
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newState)
    if (newHistory.length > 50) newHistory.shift()
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }, [history, historyIndex])

  const addItem = useCallback((item: Omit<CartItem, 'cart_id' | 'line_total'>) => {
    const cartItem: CartItem = {
      ...item,
      cart_id: crypto.randomUUID(),
      line_total: calcLineTotal(item),
    }
    pushState([...current.items, cartItem])
  }, [current.items, pushState])

  const updateItem = useCallback((cartId: string, updates: Partial<CartItem>) => {
    const newItems = current.items.map(item => {
      if (item.cart_id !== cartId) return item
      const updated = { ...item, ...updates }
      updated.line_total = calcLineTotal(updated)
      return updated
    })
    pushState(newItems)
  }, [current.items, pushState])

  const removeItem = useCallback((cartId: string) => {
    pushState(current.items.filter(i => i.cart_id !== cartId))
  }, [current.items, pushState])

  const clearCart = useCallback(() => {
    pushState([])
    localStorage.removeItem(STORAGE_KEY)
  }, [pushState])

  const undo = useCallback(() => {
    if (historyIndex > 0) setHistoryIndex(historyIndex - 1)
  }, [historyIndex])

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1)
  }, [historyIndex, history.length])

  const subtotal = current.items.reduce((sum, i) => sum + i.line_total, 0)
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100
  const total = Math.round((subtotal + tax) * 100) / 100
  const itemCount = current.items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <CartContext.Provider value={{
      items: current.items,
      addItem,
      updateItem,
      removeItem,
      clearCart,
      undo,
      redo,
      canUndo: historyIndex > 0,
      canRedo: historyIndex < history.length - 1,
      subtotal,
      tax,
      total,
      itemCount,
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
