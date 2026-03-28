import { useState } from 'react'
import { Plus, Check, X } from 'lucide-react'
import { supabase } from '../config/supabase'
import { MenuCategory, MenuItem as MenuItemType } from '../types'
import MenuItemRow from './MenuItem'
import GoldDivider from './GoldDivider'

interface Props {
  category: MenuCategory
  items: MenuItemType[]
  isAdmin: boolean
  onUpdate: () => void
}

export default function MenuSection({ category, items, isAdmin, onUpdate }: Props) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newDesc, setNewDesc] = useState('')

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
      <h2 style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 28,
        color: 'var(--gold)',
        textTransform: 'uppercase',
        letterSpacing: 3,
        textAlign: 'center',
      }}>
        {category.name}
      </h2>
      <GoldDivider />

      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {items
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(item => (
            <MenuItemRow key={item.id} item={item} isAdmin={isAdmin} onUpdate={onUpdate} />
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
