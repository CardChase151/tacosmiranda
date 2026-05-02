import { useState } from 'react'
import { Pencil, Trash2, EyeOff, Eye } from 'lucide-react'
import { supabase } from '../config/supabase'
import { MenuItem as MenuItemType, MenuCategory } from '../types'
import { deleteOrArchiveMenuItem } from '../utils/menuItemDelete'
import EditItemModal from './EditItemModal'

interface Props {
  item: MenuItemType
  isAdmin: boolean
  onUpdate: () => void
  light?: boolean
  categories?: MenuCategory[]
}

export default function MenuItemRow({ item, isAdmin, onUpdate, light, categories = [] }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [toggling, setToggling] = useState(false)
  const is86 = !!item.is_86

  const handleDelete = async () => {
    const result = await deleteOrArchiveMenuItem(item.id)
    if (result.kind === 'error') {
      alert(`Couldn't delete ${item.name}: ${result.message}`)
      return
    }
    if (result.kind === 'archived') {
      alert(`${item.name} has ${result.orderCount} past order${result.orderCount === 1 ? '' : 's'}, so it was hidden (86'd) instead of deleted to keep receipts intact.`)
    }
    setConfirmDelete(false)
    onUpdate()
  }

  const handleToggle86 = async () => {
    setToggling(true)
    await supabase.from('menu_items').update({ is_86: !is86 }).eq('id', item.id)
    setToggling(false)
    onUpdate()
  }

  return (
    <>
      <div
        style={{
          padding: '12px 0',
          borderLeft: isAdmin ? (is86 ? '2px solid #ef4444' : '2px solid var(--gold)') : '2px solid transparent',
          paddingLeft: 16,
          marginLeft: -16,
          position: 'relative',
          opacity: is86 ? 0.55 : 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: 17,
            fontWeight: 600,
            color: light ? '#1a1a1a' : 'var(--white)',
            textDecoration: is86 ? 'line-through' : 'none',
          }}>
            {item.name}
          </span>
          {isAdmin && is86 && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
              background: 'rgba(239,68,68,0.15)', color: '#ef4444',
              padding: '2px 6px', borderRadius: 4, lineHeight: 1.2,
            }}>
              86'd
            </span>
          )}
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
            color: light ? '#8B6914' : 'var(--gold)',
            whiteSpace: 'nowrap',
          }}>
            ${item.price.toFixed(2)}
          </span>

          {isAdmin && (
            <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
              <button
                onClick={handleToggle86}
                disabled={toggling}
                style={{
                  background: is86 ? 'rgba(74,222,128,0.15)' : 'none',
                  border: 'none', borderRadius: 4,
                  color: is86 ? '#4ade80' : '#ef4444',
                  padding: '2px 6px',
                  opacity: toggling ? 0.5 : 0.85,
                  cursor: toggling ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                }}
                title={is86 ? 'Bring back on the menu' : 'Hide from menu (86)'}
              >
                {is86 ? <Eye size={12} /> : <EyeOff size={12} />}
                {is86 ? 'UN-86' : '86'}
              </button>
              <button
                onClick={() => setEditOpen(true)}
                style={{ background: 'none', border: 'none', color: 'var(--gold)', padding: 4, opacity: 0.7, cursor: 'pointer' }}
                title="Edit"
              >
                <Pencil size={14} />
              </button>
              {confirmDelete ? (
                <button
                  onClick={handleDelete}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  Confirm
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', padding: 4, opacity: 0.7, cursor: 'pointer' }}
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
            color: light ? '#666666' : 'var(--gray)',
            marginTop: 4,
            lineHeight: 1.5,
          }}>
            {item.description}
          </p>
        )}
      </div>

      {editOpen && (
        <EditItemModal
          item={item}
          categories={categories}
          onClose={() => setEditOpen(false)}
          onUpdate={onUpdate}
        />
      )}
    </>
  )
}
