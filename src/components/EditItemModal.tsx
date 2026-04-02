import { useState } from 'react'
import { X, Check, Trash2 } from 'lucide-react'
import { supabase } from '../config/supabase'
import { MenuItem, MenuCategory } from '../types'

interface Props {
  item: MenuItem
  categories: MenuCategory[]
  onClose: () => void
  onUpdate: () => void
}

export default function EditItemModal({ item, categories, onClose, onUpdate }: Props) {
  const [name, setName] = useState(item.name)
  const [price, setPrice] = useState(item.price.toString())
  const [description, setDescription] = useState(item.description)
  const [categoryId, setCategoryId] = useState(item.category_id)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const currentCategory = categories.find(c => c.id === categoryId)
  const mealType = currentCategory?.meal_type || 'lunch_dinner'

  const handleSave = async () => {
    if (!name || !price) return
    setSaving(true)
    await supabase
      .from('menu_items')
      .update({ name, price: parseFloat(price), description, category_id: categoryId })
      .eq('id', item.id)
    setSaving(false)
    onUpdate()
    onClose()
  }

  const handleDelete = async () => {
    await supabase.from('menu_items').delete().eq('id', item.id)
    onUpdate()
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--dark-input)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--white)',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'var(--font-body)',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--gold)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    display: 'block',
  }

  const breakfastCategories = categories.filter(c => c.meal_type === 'breakfast')
  const lunchCategories = categories.filter(c => c.meal_type === 'lunch_dinner')

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--dark-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 28,
          width: 440,
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          animation: 'fadeInUp 0.3s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, color: 'var(--gold)' }}>Edit Item</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--gray)', padding: 4, cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Meal Type Badge */}
        <div style={{ marginBottom: 20 }}>
          <span style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: 50,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            background: mealType === 'breakfast' ? 'rgba(200,168,78,0.15)' : 'rgba(255,255,255,0.08)',
            color: mealType === 'breakfast' ? 'var(--gold)' : 'var(--gray)',
            border: mealType === 'breakfast' ? '1px solid var(--gold)' : '1px solid var(--border)',
          }}>
            {mealType === 'breakfast' ? 'Breakfast' : 'Lunch & Dinner'}
          </span>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </div>

        {/* Price */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Price</label>
          <input
            value={price}
            onChange={e => setPrice(e.target.value)}
            type="number"
            step="0.01"
            style={{ ...inputStyle, width: 140 }}
          />
        </div>

        {/* Description / Ingredients */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Description / Ingredients</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="Ingredients, toppings, etc."
          />
        </div>

        {/* Category */}
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Category</label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            style={{
              ...inputStyle,
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: 36,
            }}
          >
            <optgroup label="Breakfast">
              {breakfastCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
            <optgroup label="Lunch & Dinner">
              {lunchCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#ef4444' }}>Delete this item?</span>
              <button
                onClick={handleDelete}
                style={{
                  background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  background: 'none', color: 'var(--gray)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                background: 'none', border: 'none', color: '#ef4444', opacity: 0.6,
                fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !name || !price}
            style={{
              background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: 8,
              padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: saving || !name || !price ? 0.5 : 1,
            }}
          >
            <Check size={16} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
