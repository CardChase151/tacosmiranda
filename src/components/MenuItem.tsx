import { useState } from 'react'
import { Pencil, Trash2, EyeOff, Eye, ImageIcon, X, Clock, AlertTriangle } from 'lucide-react'
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
  const [removeOpen, setRemoveOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [toggling, setToggling] = useState(false)
  const is86 = !!item.is_86

  const handleDelete = async () => {
    const result = await deleteOrArchiveMenuItem(item.id)
    if (result.kind === 'error') {
      alert(`Couldn't remove ${item.name}: ${result.message}`)
      return
    }
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
          {item.image_url && (
            <button
              onClick={() => setPhotoOpen(true)}
              aria-label={`See a photo of ${item.name}`}
              title="See photo"
              style={{
                background: 'none',
                border: 'none',
                padding: 2,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                color: light ? '#8B6914' : 'var(--gold)',
                opacity: 0.75,
                alignSelf: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.75')}
            >
              <ImageIcon size={15} />
            </button>
          )}
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
              {is86 ? (
                <button
                  onClick={handleToggle86}
                  disabled={toggling}
                  style={{
                    background: 'rgba(74,222,128,0.15)', border: 'none', borderRadius: 4,
                    color: '#4ade80', padding: '2px 6px',
                    opacity: toggling ? 0.5 : 0.85,
                    cursor: toggling ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                  }}
                  title="Put this back on the menu"
                >
                  <Eye size={12} /> PUT BACK ON
                </button>
              ) : (
                <button
                  onClick={() => setRemoveOpen(true)}
                  style={{
                    background: 'none', border: 'none', borderRadius: 4,
                    color: '#ef4444', padding: '2px 6px', opacity: 0.85, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                  }}
                  title="Take this off the menu"
                >
                  <EyeOff size={12} /> TAKE OFF
                </button>
              )}
              <button
                onClick={() => setEditOpen(true)}
                style={{ background: 'none', border: 'none', color: 'var(--gold)', padding: 4, opacity: 0.7, cursor: 'pointer' }}
                title="Edit"
              >
                <Pencil size={14} />
              </button>
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

      {removeOpen && (
        <div
          onClick={() => setRemoveOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#161616', border: '1px solid var(--border)', borderRadius: 16,
              maxWidth: 420, width: '100%', padding: 24,
            }}
          >
            <h3 style={{ color: 'var(--white)', fontSize: 19, fontWeight: 700, margin: '0 0 6px' }}>
              Take {item.name} off?
            </h3>
            <p style={{ color: 'var(--gray)', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
              Either way customers stop seeing it right now.
            </p>

            <button
              onClick={async () => { setRemoveOpen(false); await handleToggle86() }}
              style={{
                width: '100%', textAlign: 'left', padding: '14px 16px', marginBottom: 10,
                borderRadius: 10, border: '1px solid #f59e0b', background: 'rgba(245,158,11,0.10)',
                color: 'var(--white)', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: '#f59e0b' }}>
                <Clock size={16} /> Just for now
              </div>
              <div style={{ color: 'var(--gray)', fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                Ran out today. It stays on your 86 list and you put it back when you have it.
              </div>
            </button>

            <button
              onClick={async () => { setRemoveOpen(false); await handleDelete() }}
              style={{
                width: '100%', textAlign: 'left', padding: '14px 16px',
                borderRadius: 10, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.10)',
                color: 'var(--white)', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: '#ef4444' }}>
                <AlertTriangle size={16} /> Off the menu for good
              </div>
              <div style={{ color: 'var(--gray)', fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                Not selling it anymore. Deleted from the menu. Past orders keep it on their receipt.
              </div>
            </button>

            <button
              onClick={() => setRemoveOpen(false)}
              style={{
                width: '100%', marginTop: 14, padding: '11px 16px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--gray)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {photoOpen && item.image_url && (
        <div
          onClick={() => setPhotoOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
            padding: 20,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 640, width: '100%' }}>
            <img
              src={item.image_url}
              alt={item.name}
              style={{ width: '100%', borderRadius: 12, display: 'block' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginTop: 12 }}>
              <span style={{ color: 'var(--white)', fontSize: 18, fontWeight: 700 }}>{item.name}</span>
              <span style={{ color: 'var(--gold)', fontSize: 18, fontWeight: 700 }}>${item.price.toFixed(2)}</span>
            </div>
            <button
              onClick={() => setPhotoOpen(false)}
              aria-label="Close photo"
              style={{
                position: 'absolute', top: -14, right: -14,
                width: 40, height: 40, borderRadius: 20,
                background: '#1a1a1a', border: '1px solid var(--border)',
                color: 'var(--white)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

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
