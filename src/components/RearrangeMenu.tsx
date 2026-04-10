import { useState, useMemo } from 'react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, ChevronDown, ChevronRight, X, Check } from 'lucide-react'
import { supabase } from '../config/supabase'
import { MenuCategory, MenuItem } from '../types'

interface Props {
  categories: MenuCategory[]
  items: MenuItem[]
  mealType: 'breakfast' | 'lunch_dinner'
  light: boolean
  onClose: () => void
  onSaved: () => void
}

export default function RearrangeMenu({ categories, items, mealType, light, onClose, onSaved }: Props) {
  // Local mutable copies, scoped to current meal type, sorted by current sort_order.
  const initialCategories = useMemo(
    () =>
      categories
        .filter(c => c.meal_type === mealType)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order),
    [categories, mealType]
  )
  const initialItems = useMemo(
    () =>
      items
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order),
    [items]
  )

  const [localCategories, setLocalCategories] = useState<MenuCategory[]>(initialCategories)
  const [localItems, setLocalItems] = useState<MenuItem[]>(initialItems)
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // PointerSensor with a 5px activation distance lets you tap to expand
  // without immediately starting a drag. TouchSensor mirrors that for mobile.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  )

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLocalCategories(prev => {
      const oldIndex = prev.findIndex(c => c.id === active.id)
      const newIndex = prev.findIndex(c => c.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
    setDirty(true)
  }

  const handleItemDragEnd = (categoryId: string) => (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLocalItems(prev => {
      const inCategory = prev.filter(i => i.category_id === categoryId)
      const oldIndex = inCategory.findIndex(i => i.id === active.id)
      const newIndex = inCategory.findIndex(i => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      const reordered = arrayMove(inCategory, oldIndex, newIndex)
      // Replace this category's items in the full list, keep others untouched.
      const reorderedIds = new Set(reordered.map(i => i.id))
      const others = prev.filter(i => !reorderedIds.has(i.id))
      return [...others, ...reordered]
    })
    setDirty(true)
  }

  const handleSave = async () => {
    if (!dirty || saving) return
    setSaving(true)
    try {
      // Reassign sort_order based on current local position.
      // Categories: 1..N within meal type
      const categoryUpdates = localCategories.map((c, idx) => ({
        id: c.id,
        sort_order: idx + 1,
      }))

      // Items: 1..N within each category
      const itemUpdates: Array<{ id: string; sort_order: number }> = []
      for (const cat of localCategories) {
        const inCat = localItems
          .filter(i => i.category_id === cat.id)
          // Preserve current local order, which the user may have rearranged.
          // We can't sort by sort_order here because that's the *old* order.
        inCat.forEach((item, idx) => {
          itemUpdates.push({ id: item.id, sort_order: idx + 1 })
        })
      }

      // Run updates in parallel. Each is a single-row PATCH so we don't
      // need to worry about partial failures cascading.
      const catPromises = categoryUpdates.map(u =>
        supabase.from('menu_categories').update({ sort_order: u.sort_order }).eq('id', u.id)
      )
      const itemPromises = itemUpdates.map(u =>
        supabase.from('menu_items').update({ sort_order: u.sort_order }).eq('id', u.id)
      )
      const results = await Promise.all([...catPromises, ...itemPromises])
      const failed = results.filter(r => r.error)
      if (failed.length > 0) {
        console.error('Rearrange save errors:', failed.map(r => r.error?.message))
        alert(`Failed to save ${failed.length} change${failed.length === 1 ? '' : 's'}. Check console.`)
        setSaving(false)
        return
      }

      setDirty(false)
      onSaved()
      onClose()
    } catch (err) {
      console.error('Rearrange save crashed:', err)
      alert('Failed to save. Check console.')
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (dirty && !window.confirm('Discard your rearrangement?')) return
    onClose()
  }

  // Theme tokens
  const bg = light ? '#FAF8F3' : '#0a0a0a'
  const cardBg = light ? '#FFFFFF' : '#1a1a1a'
  const cardBorder = light ? '1px solid #D4CFC3' : '1px solid #2a2a2a'
  const text = light ? '#1a1a1a' : '#FFFFFF'
  const subtext = light ? '#888888' : '#999999'
  const accent = light ? '#8B6914' : 'var(--gold)'
  const accentText = light ? '#FAF8F3' : '#1a1a1a'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: bg,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: cardBorder,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 22,
              color: text,
              margin: 0,
              letterSpacing: 2,
            }}
          >
            Rearrange Menu
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: subtext, textTransform: 'uppercase', letterSpacing: 1 }}>
            {mealType === 'breakfast' ? 'Breakfast' : 'Lunch & Dinner'} · Drag to reorder
          </p>
        </div>
        <button
          onClick={handleClose}
          aria-label="Close"
          style={{
            background: 'none',
            border: cardBorder,
            borderRadius: 8,
            color: text,
            padding: 8,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 24px 24px',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {localCategories.length === 0 ? (
            <p style={{ color: subtext, fontSize: 14, textAlign: 'center', marginTop: 60 }}>
              No {mealType === 'breakfast' ? 'breakfast' : 'lunch & dinner'} categories yet.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
              <SortableContext items={localCategories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {localCategories.map(cat => (
                  <SortableCategoryRow
                    key={cat.id}
                    category={cat}
                    items={localItems.filter(i => i.category_id === cat.id)}
                    expanded={expandedCategoryId === cat.id}
                    onToggle={() =>
                      setExpandedCategoryId(prev => (prev === cat.id ? null : cat.id))
                    }
                    onItemDragEnd={handleItemDragEnd(cat.id)}
                    sensors={sensors}
                    cardBg={cardBg}
                    cardBorder={cardBorder}
                    text={text}
                    subtext={subtext}
                    accent={accent}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '16px 24px',
          borderTop: cardBorder,
          display: 'flex',
          gap: 12,
          justifyContent: 'flex-end',
          flexShrink: 0,
          background: bg,
        }}
      >
        <button
          onClick={handleClose}
          disabled={saving}
          style={{
            background: 'none',
            border: cardBorder,
            borderRadius: 8,
            color: text,
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.5 : 1,
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          style={{
            background: dirty && !saving ? accent : 'transparent',
            border: dirty && !saving ? `1px solid ${accent}` : cardBorder,
            borderRadius: 8,
            color: dirty && !saving ? accentText : subtext,
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            cursor: dirty && !saving ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Check size={14} /> {saving ? 'Saving…' : 'Save Order'}
        </button>
      </div>
    </div>
  )
}

interface RowProps {
  category: MenuCategory
  items: MenuItem[]
  expanded: boolean
  onToggle: () => void
  onItemDragEnd: (event: DragEndEvent) => void
  sensors: ReturnType<typeof useSensors>
  cardBg: string
  cardBorder: string
  text: string
  subtext: string
  accent: string
}

function SortableCategoryRow({
  category,
  items,
  expanded,
  onToggle,
  onItemDragEnd,
  sensors,
  cardBg,
  cardBorder,
  text,
  subtext,
  accent,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: cardBg,
        border: cardBorder,
        borderRadius: 12,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      {/* Category header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 16px',
          gap: 12,
        }}
      >
        {/* Drag handle - only this element gets the drag listeners */}
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag category"
          style={{
            background: 'none',
            border: 'none',
            color: subtext,
            cursor: 'grab',
            padding: 4,
            display: 'flex',
            touchAction: 'none',
          }}
        >
          <GripVertical size={20} />
        </button>

        {/* Tap target for expand/collapse */}
        <button
          onClick={onToggle}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            color: text,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{category.name}</span>
            <span style={{ fontSize: 11, color: subtext, marginTop: 2 }}>
              {items.length} item{items.length === 1 ? '' : 's'}
            </span>
          </div>
          <span style={{ color: subtext, display: 'flex' }}>
            {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </span>
        </button>
      </div>

      {/* Expanded items list */}
      {expanded && (
        <div
          style={{
            padding: '4px 16px 16px 48px',
            borderTop: cardBorder,
          }}
        >
          {items.length === 0 ? (
            <p style={{ color: subtext, fontSize: 13, margin: '12px 0 0' }}>No items in this category.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onItemDragEnd}>
              <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {items.map(item => (
                  <SortableItemRow
                    key={item.id}
                    item={item}
                    cardBg={cardBg}
                    cardBorder={cardBorder}
                    text={text}
                    subtext={subtext}
                    accent={accent}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  )
}

interface ItemRowProps {
  item: MenuItem
  cardBg: string
  cardBorder: string
  text: string
  subtext: string
  accent: string
}

function SortableItemRow({ item, cardBg, cardBorder, text, subtext, accent }: ItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: cardBg,
        border: cardBorder,
        borderRadius: 8,
        marginTop: 8,
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag item"
        style={{
          background: 'none',
          border: 'none',
          color: subtext,
          cursor: 'grab',
          padding: 2,
          display: 'flex',
          touchAction: 'none',
        }}
      >
        <GripVertical size={16} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.name}
        </div>
        {item.description && (
          <div
            style={{
              fontSize: 11,
              color: subtext,
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.description}
          </div>
        )}
      </div>
      <div style={{ fontSize: 13, color: accent, fontWeight: 600, flexShrink: 0 }}>
        ${Number(item.price).toFixed(2)}
      </div>
    </div>
  )
}
