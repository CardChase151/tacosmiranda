import { useState } from 'react'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import { supabase } from '../config/supabase'
import { MenuItem as MenuItemType } from '../types'

interface Props {
  item: MenuItemType
  isAdmin: boolean
  onUpdate: () => void
}

export default function MenuItemRow({ item, isAdmin, onUpdate }: Props) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [price, setPrice] = useState(item.price.toString())
  const [description, setDescription] = useState(item.description)
  const [hover, setHover] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = async () => {
    await supabase
      .from('menu_items')
      .update({ name, price: parseFloat(price), description })
      .eq('id', item.id)
    setEditing(false)
    onUpdate()
  }

  const handleDelete = async () => {
    await supabase.from('menu_items').delete().eq('id', item.id)
    onUpdate()
  }

  const handleCancel = () => {
    setName(item.name)
    setPrice(item.price.toString())
    setDescription(item.description)
    setEditing(false)
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

  if (editing) {
    return (
      <div style={{
        padding: '12px 0',
        borderLeft: '2px solid var(--gold)',
        paddingLeft: 16,
        marginLeft: -16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <input
            value={price}
            onChange={e => setPrice(e.target.value)}
            style={{ ...inputStyle, width: 80, textAlign: 'right' }}
            type="number"
            step="0.01"
          />
        </div>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{ ...inputStyle, width: '100%' }}
          placeholder="Description"
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSave}
            style={{
              background: 'var(--gold)',
              color: 'var(--black)',
              border: 'none',
              borderRadius: 6,
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Check size={14} /> Save
          </button>
          <button
            onClick={handleCancel}
            style={{
              background: 'none',
              color: 'var(--gray)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 16px',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <X size={14} /> Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '12px 0',
        borderLeft: hover && isAdmin ? '2px solid var(--gold)' : '2px solid transparent',
        paddingLeft: 16,
        marginLeft: -16,
        transition: 'border-color 0.2s',
        position: 'relative',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setConfirmDelete(false) }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: 17,
          fontWeight: 600,
          color: 'var(--white)',
        }}>
          {item.name}
        </span>
        <span style={{
          flex: 1,
          borderBottom: '1px dotted var(--gold-dim)',
          minWidth: 20,
          alignSelf: 'center',
          marginBottom: 3,
        }} />
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: 17,
          fontWeight: 700,
          color: 'var(--gold)',
          whiteSpace: 'nowrap',
        }}>
          ${item.price.toFixed(2)}
        </span>

        {isAdmin && hover && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
            <button
              onClick={() => setEditing(true)}
              style={{ background: 'none', border: 'none', color: 'var(--gold)', padding: 4, opacity: 0.7 }}
              title="Edit"
            >
              <Pencil size={14} />
            </button>
            {confirmDelete ? (
              <button
                onClick={handleDelete}
                style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}
              >
                Confirm
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ background: 'none', border: 'none', color: '#ef4444', padding: 4, opacity: 0.7 }}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {item.description && (
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: 'var(--gray)',
          marginTop: 4,
          lineHeight: 1.5,
        }}>
          {item.description}
        </p>
      )}
    </div>
  )
}
