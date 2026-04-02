import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../config/supabase'
import { MenuItem as MenuItemType, MenuCategory } from '../types'
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

  const handleDelete = async () => {
    await supabase.from('menu_items').delete().eq('id', item.id)
    onUpdate()
  }

  return (
    <>
      <div
        style={{
          padding: '12px 0',
          borderLeft: isAdmin ? '2px solid var(--gold)' : '2px solid transparent',
          paddingLeft: 16,
          marginLeft: -16,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: 17,
            fontWeight: 600,
            color: light ? '#1a1a1a' : 'var(--white)',
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
            color: light ? '#8B6914' : 'var(--gold)',
            whiteSpace: 'nowrap',
          }}>
            ${item.price.toFixed(2)}
          </span>

          {isAdmin && (
            <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
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
