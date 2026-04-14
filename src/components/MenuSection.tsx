import { useState } from 'react'
import { Plus, Check, X, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../config/supabase'
import { MenuCategory, MenuItem as MenuItemType } from '../types'
import MenuItemRow from './MenuItem'
import GoldDivider from './GoldDivider'

interface Props {
  category: MenuCategory
  items: MenuItemType[]
  isAdmin: boolean
  onUpdate: () => void
  light?: boolean
  allCategories?: MenuCategory[]
}

export default function MenuSection({ category, items, isAdmin, onUpdate, light, allCategories = [] }: Props) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editingCategory, setEditingCategory] = useState(false)
  const [editCategoryName, setEditCategoryName] = useState(category.name)

  const handleSaveCategory = async () => {
    const trimmed = editCategoryName.trim()
    if (!trimmed || trimmed === category.name) {
      setEditingCategory(false)
      setEditCategoryName(category.name)
      return
    }
    await supabase.from('menu_categories').update({ name: trimmed }).eq('id', category.id)
    setEditingCategory(false)
    onUpdate()
  }

  const handleDeleteCategory = async () => {
    if (items.length > 0) {
      alert(`Cannot delete "${category.name}" because it still has ${items.length} item${items.length === 1 ? '' : 's'}. Move or delete them first.`)
      return
    }
    if (!window.confirm(`Delete category "${category.name}"?`)) return
    await supabase.from('menu_categories').delete().eq('id', category.id)
    onUpdate()
  }

  const handleAdd = async () => {
    if (!newName || !newPrice) return
    const maxSort = items.reduce((max, i) => Math.max(max, i.sort_order), 0)
    await supabase.from('menu_items').insert({
      category_id: category.id,
      name: newName,
      price: parseFloat(newPrice),
      description: newDesc,
      sort_order: maxSort + 1,
    })
    setNewName('')
    setNewPrice('')
    setNewDesc('')
    setAdding(false)
    onUpdate()
  }

  const iconBtnStyle = (light?: boolean, primary?: boolean): React.CSSProperties => ({
    background: primary ? (light ? '#8B6914' : 'var(--gold)') : 'transparent',
    color: primary ? (light ? '#FAF8F3' : 'var(--black)') : (light ? '#8B6914' : 'var(--gold)'),
    border: primary ? 'none' : (light ? '1px solid #D4CFC3' : '1px solid var(--border)'),
    borderRadius: 6,
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  })

  const inputStyle: React.CSSProperties = {
    background: 'var(--dark-input)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--white)',
    padding: '6px 10px',
    fontSize: 14,
    outline: 'none',
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {editingCategory ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
          <input
            value={editCategoryName}
            onChange={e => setEditCategoryName(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSaveCategory(); if (e.key === 'Escape') { setEditingCategory(false); setEditCategoryName(category.name) } }}
            style={{
              ...inputStyle,
              fontSize: 20,
              fontFamily: 'var(--font-body)',
              textAlign: 'center',
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: light ? '#8B6914' : 'var(--gold)',
              background: light ? '#FFFFFF' : 'var(--dark-input)',
              border: light ? '1px solid #D4CFC3' : '1px solid var(--border)',
            }}
          />
          <button onClick={handleSaveCategory} style={iconBtnStyle(light, true)} title="Save"><Check size={16} /></button>
          <button onClick={() => { setEditingCategory(false); setEditCategoryName(category.name) }} style={iconBtnStyle(light)} title="Cancel"><X size={16} /></button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <h2 style={{
            fontFamily: 'var(--font-body)',
            fontSize: 28,
            color: light ? '#8B6914' : 'var(--gold)',
            textTransform: 'uppercase',
            letterSpacing: 3,
            textAlign: 'center',
            margin: 0,
          }}>
            {category.name}
          </h2>
          {isAdmin && (
            <>
              <button onClick={() => { setEditCategoryName(category.name); setEditingCategory(true) }} style={iconBtnStyle(light)} title="Rename category">
                <Pencil size={14} />
              </button>
              <button onClick={handleDeleteCategory} style={iconBtnStyle(light)} title="Delete category">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      )}
      <GoldDivider />

      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {items
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(item => (
            <MenuItemRow key={item.id} item={item} isAdmin={isAdmin} onUpdate={onUpdate} light={light} categories={allCategories} />
          ))
        }

        {isAdmin && !adding && (
          <button
            onClick={() => setAdding(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: '1px dashed var(--border)',
              borderRadius: 8,
              color: 'var(--gray-dark)',
              padding: '8px 16px',
              fontSize: 13,
              marginTop: 12,
              width: '100%',
              justifyContent: 'center',
              transition: 'border-color 0.2s, color 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--gray-dark)' }}
          >
            <Plus size={14} /> Add Item
          </button>
        )}

        {isAdmin && adding && (
          <div style={{
            padding: 16,
            borderLeft: '2px solid var(--gold)',
            marginTop: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Item name" style={{ ...inputStyle, flex: 1 }} />
              <input value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="Price" type="number" step="0.01" style={{ ...inputStyle, width: 80 }} />
            </div>
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" style={inputStyle} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAdd} style={{
                background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: 6,
                padding: '6px 16px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Check size={14} /> Add
              </button>
              <button onClick={() => setAdding(false)} style={{
                background: 'none', color: 'var(--gray)', border: '1px solid var(--border)', borderRadius: 6,
                padding: '6px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <X size={14} /> Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
