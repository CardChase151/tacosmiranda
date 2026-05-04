import { useState, useEffect } from 'react'
import { X, Check, Trash2, Plus, Eye } from 'lucide-react'
import { supabase } from '../config/supabase'
import { MenuItem, MenuCategory, Ingredient, IngredientCategory, MenuItemIngredient, ModifierGroup, Modifier, MenuItemModifierGroup } from '../types'
import { deleteOrArchiveMenuItem } from '../utils/menuItemDelete'
import ItemCustomizer from './order/ItemCustomizer'
import { CartProvider } from '../context/CartContext'

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

  // Linked data
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([])
  const [linkedIngs, setLinkedIngs] = useState<MenuItemIngredient[]>([])
  const [ingredientCategories, setIngredientCategories] = useState<IngredientCategory[]>([])
  const [allModGroups, setAllModGroups] = useState<ModifierGroup[]>([])
  const [allModifiers, setAllModifiers] = useState<Modifier[]>([])
  const [linkedMgs, setLinkedMgs] = useState<MenuItemModifierGroup[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)

  // Quick-add ingredient state
  const [newIngName, setNewIngName] = useState('')
  const [newIngCategoryId, setNewIngCategoryId] = useState<string>('')
  const [newCategoryMode, setNewCategoryMode] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  useEffect(() => {
    (async () => {
      const [iRes, miiRes, icRes, mgRes, modRes, mimgRes] = await Promise.all([
        supabase.from('ingredients').select('*').eq('is_86', false).order('sort_order'),
        supabase.from('menu_item_ingredients').select('*').eq('menu_item_id', item.id).order('sort_order'),
        supabase.from('ingredient_categories').select('*').eq('is_86', false).order('sort_order'),
        supabase.from('modifier_groups').select('*').order('sort_order'),
        supabase.from('modifiers').select('*').eq('is_86', false).order('sort_order'),
        supabase.from('menu_item_modifier_groups').select('*').eq('menu_item_id', item.id).order('sort_order'),
      ])
      if (iRes.data) setAllIngredients(iRes.data as Ingredient[])
      if (miiRes.data) setLinkedIngs(miiRes.data as MenuItemIngredient[])
      if (icRes.data) {
        const cats = icRes.data as IngredientCategory[]
        setIngredientCategories(cats)
        if (cats.length > 0 && !newIngCategoryId) setNewIngCategoryId(cats[0].id)
      }
      if (mgRes.data) setAllModGroups(mgRes.data as ModifierGroup[])
      if (modRes.data) setAllModifiers(modRes.data as Modifier[])
      if (mimgRes.data) setLinkedMgs(mimgRes.data as MenuItemModifierGroup[])
    })()
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentCategory = categories.find(c => c.id === categoryId)
  const mealType = currentCategory?.meal_type || 'lunch_dinner'

  const handleSave = async () => {
    if (!name || !price) return
    setSaving(true)
    await supabase.from('menu_items').update({ name, price: parseFloat(price), description, category_id: categoryId }).eq('id', item.id)
    setSaving(false)
    onUpdate()
    onClose()
  }

  const handleDelete = async () => {
    const result = await deleteOrArchiveMenuItem(item.id)
    if (result.kind === 'error') { alert(`Couldn't delete ${item.name}: ${result.message}`); return }
    if (result.kind === 'archived') {
      alert(`${item.name} has ${result.orderCount} past order${result.orderCount === 1 ? '' : 's'}, hidden (86'd) instead to keep receipts intact.`)
    }
    onUpdate(); onClose()
  }

  // ===== ingredient link CRUD =====
  const addIngredientLink = async (ingredientId: string) => {
    const max = Math.max(0, ...linkedIngs.map(l => l.sort_order)) + 10
    const { data } = await supabase.from('menu_item_ingredients').insert({
      menu_item_id: item.id, ingredient_id: ingredientId,
      is_default: true, is_removable: true, can_add_extra: true,
      extra_charge: 0, sort_order: max,
    }).select().single()
    if (data) setLinkedIngs([...linkedIngs, data as MenuItemIngredient])
  }

  const updateIngredientLink = async (linkId: string, patch: Partial<MenuItemIngredient>) => {
    setLinkedIngs(prev => prev.map(l => l.id === linkId ? { ...l, ...patch } : l))
    await supabase.from('menu_item_ingredients').update(patch).eq('id', linkId)
  }

  const removeIngredientLink = async (linkId: string) => {
    setLinkedIngs(prev => prev.filter(l => l.id !== linkId))
    await supabase.from('menu_item_ingredients').delete().eq('id', linkId)
  }

  // Quick-add by typing the name. Reuses existing ingredient if name matches
  // (case-insensitive); otherwise creates a new one in the chosen category.
  const quickAddIngredient = async () => {
    const trimmed = newIngName.trim()
    if (!trimmed || !newIngCategoryId) return

    const existing = allIngredients.find(i => i.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      if (linkedIngs.some(l => l.ingredient_id === existing.id)) {
        alert(`${existing.name} is already on this item.`)
        return
      }
      await addIngredientLink(existing.id)
      setNewIngName('')
      return
    }

    // Create new ingredient
    const cat = ingredientCategories.find(c => c.id === newIngCategoryId)
    const maxOrder = Math.max(0, ...allIngredients.map(i => i.sort_order)) + 10
    const { data: newIng, error } = await supabase.from('ingredients').insert({
      name: trimmed,
      category: cat?.name || '',
      category_id: newIngCategoryId,
      sort_order: maxOrder,
    }).select().single()
    if (error || !newIng) { alert(error?.message || 'Could not create ingredient'); return }
    setAllIngredients(prev => [...prev, newIng as Ingredient])
    await addIngredientLink((newIng as Ingredient).id)
    setNewIngName('')
  }

  const createNewCategory = async () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) return
    const maxOrder = Math.max(0, ...ingredientCategories.map(c => c.sort_order)) + 10
    const { data, error } = await supabase.from('ingredient_categories').insert({
      name: trimmed, sort_order: maxOrder,
    }).select().single()
    if (error || !data) { alert(error?.message || 'Could not create category'); return }
    const newCat = data as IngredientCategory
    setIngredientCategories(prev => [...prev, newCat])
    setNewIngCategoryId(newCat.id)
    setNewCategoryName('')
    setNewCategoryMode(false)
  }

  const bulkSetIngredientFlag = async (field: 'is_removable' | 'can_add_extra' | 'is_default', value: boolean) => {
    setLinkedIngs(prev => prev.map(l => ({ ...l, [field]: value })))
    await supabase.from('menu_item_ingredients').update({ [field]: value }).eq('menu_item_id', item.id)
  }

  // ===== modifier group link CRUD =====
  const addModGroupLink = async (groupId: string) => {
    const max = Math.max(0, ...linkedMgs.map(l => l.sort_order)) + 10
    const { data } = await supabase.from('menu_item_modifier_groups').insert({
      menu_item_id: item.id, modifier_group_id: groupId,
      is_required: true, min_selections: 1, max_selections: 1, sort_order: max,
    }).select().single()
    if (data) setLinkedMgs([...linkedMgs, data as MenuItemModifierGroup])
  }

  const updateModGroupLink = async (linkId: string, patch: Partial<MenuItemModifierGroup>) => {
    setLinkedMgs(prev => prev.map(l => l.id === linkId ? { ...l, ...patch } : l))
    await supabase.from('menu_item_modifier_groups').update(patch).eq('id', linkId)
  }

  const removeModGroupLink = async (linkId: string) => {
    setLinkedMgs(prev => prev.filter(l => l.id !== linkId))
    await supabase.from('menu_item_modifier_groups').delete().eq('id', linkId)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: 'var(--dark-input)',
    border: '1px solid var(--border)', borderRadius: 8, color: 'var(--white)',
    fontSize: 14, outline: 'none', fontFamily: 'var(--font-body)',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--gold)', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 6, display: 'block',
  }

  const breakfastCategories = categories.filter(c => c.meal_type === 'breakfast')
  const lunchCategories = categories.filter(c => c.meal_type === 'lunch_dinner')

  const linkedMgIds = new Set(linkedMgs.map(l => l.modifier_group_id))
  const unlinkedMgs = allModGroups.filter(g => !linkedMgIds.has(g.id))

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--dark-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 28, width: 560, maxWidth: '95vw',
          maxHeight: '90vh', overflowY: 'auto', animation: 'fadeInUp 0.3s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, color: 'var(--gold)' }}>Edit Item</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--gray)', padding: 4, cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <span style={{
            display: 'inline-block', padding: '4px 12px', borderRadius: 50,
            fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
            background: mealType === 'breakfast' ? 'rgba(200,168,78,0.15)' : 'rgba(255,255,255,0.08)',
            color: mealType === 'breakfast' ? 'var(--gold)' : 'var(--gray)',
            border: mealType === 'breakfast' ? '1px solid var(--gold)' : '1px solid var(--border)',
          }}>
            {mealType === 'breakfast' ? 'Breakfast' : 'Lunch & Dinner'}
          </span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Price</label>
          <input value={price} onChange={e => setPrice(e.target.value)} type="number" step="0.01" style={{ ...inputStyle, width: 140 }} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Description for Menu</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder={`"Tacos Miranda's Favorite" or "Your choice of..."`} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Category</label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            style={{
              ...inputStyle, appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 36,
            }}
          >
            <optgroup label="Breakfast">
              {breakfastCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
            <optgroup label="Lunch & Dinner">
              {lunchCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          </select>
        </div>

        {/* ===== Default Ingredients ===== */}
        <div style={{ marginBottom: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <label style={{ ...labelStyle, marginBottom: 6 }}>Ingredients ({linkedIngs.length})</label>
          <p style={{ color: 'var(--gray)', fontSize: 11, margin: '0 0 10px', lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--gold)' }}>Default On</strong>: comes with the item by default.
            {' '}<strong style={{ color: 'var(--gold)' }}>Removable</strong>: customer can untoggle.
            {' '}<strong style={{ color: 'var(--gold)' }}>Extra OK</strong>: customer can add more (extra charge optional).
          </p>
          {linkedIngs.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <button onClick={() => bulkSetIngredientFlag('is_removable', true)} style={bulkBtn}>All removable</button>
              <button onClick={() => bulkSetIngredientFlag('can_add_extra', true)} style={bulkBtn}>All extra OK</button>
              <button onClick={() => bulkSetIngredientFlag('is_default', true)} style={bulkBtn}>All default on</button>
            </div>
          )}
          {linkedIngs.length === 0 && <p style={{ color: 'var(--gray)', fontSize: 12, marginBottom: 10 }}>No ingredients linked.</p>}
          {linkedIngs.map(link => {
            const ing = allIngredients.find(i => i.id === link.ingredient_id)
            if (!ing) return null
            return (
              <div key={link.id} style={linkRow}>
                <span style={{ flex: 1, color: 'var(--gold)', fontSize: 13 }}>{ing.name}</span>
                <ToggleChip on={link.is_default} onClick={() => updateIngredientLink(link.id, { is_default: !link.is_default })} label="Default On" />
                <ToggleChip on={link.is_removable} onClick={() => updateIngredientLink(link.id, { is_removable: !link.is_removable })} label="Removable" />
                <ToggleChip on={link.can_add_extra} onClick={() => updateIngredientLink(link.id, { can_add_extra: !link.can_add_extra })} label="Extra OK" />
                <input type="number" step="0.01" value={link.extra_charge} onChange={e => updateIngredientLink(link.id, { extra_charge: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: 70, padding: '4px 8px', fontSize: 12 }} title="Extra charge per add-on" placeholder="$" />
                <button onClick={() => removeIngredientLink(link.id)} style={miniBtn}><Trash2 size={12} /></button>
              </div>
            )
          })}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
            <p style={{ fontSize: 10, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Add ingredient</p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={newIngName}
                onChange={e => setNewIngName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && quickAddIngredient()}
                placeholder="Type a name (e.g. Cilantro)"
                style={{ ...inputStyle, flex: '1 1 180px', padding: '8px 12px', fontSize: 13 }}
              />
              {newCategoryMode ? (
                <>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createNewCategory()}
                    placeholder="New category…"
                    autoFocus
                    style={{ ...inputStyle, width: 130, padding: '8px 12px', fontSize: 13 }}
                  />
                  <button onClick={createNewCategory} style={{ background: '#34d399', color: '#000', border: 'none', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => { setNewCategoryMode(false); setNewCategoryName('') }} style={{ background: 'transparent', color: 'var(--gray)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                </>
              ) : (
                <>
                  <select
                    value={newIngCategoryId}
                    onChange={e => {
                      if (e.target.value === '__new__') { setNewCategoryMode(true) }
                      else setNewIngCategoryId(e.target.value)
                    }}
                    style={{ ...inputStyle, width: 130, padding: '8px 10px', fontSize: 12 }}
                  >
                    {ingredientCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value="__new__">+ New category…</option>
                  </select>
                  <button
                    onClick={quickAddIngredient}
                    disabled={!newIngName.trim()}
                    style={{ background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: !newIngName.trim() ? 0.5 : 1 }}
                  >
                    <Plus size={13} /> Add
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ===== Modifier Groups ===== */}
        <div style={{ marginBottom: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <label style={{ ...labelStyle, marginBottom: 12 }}>Modifier Groups ({linkedMgs.length})</label>
          {linkedMgs.length === 0 && <p style={{ color: 'var(--gray)', fontSize: 12, marginBottom: 10 }}>No modifier groups linked.</p>}
          {linkedMgs.map(link => {
            const mg = allModGroups.find(g => g.id === link.modifier_group_id)
            if (!mg) return null
            return (
              <div key={link.id} style={linkRow}>
                <span style={{ flex: 1, color: 'var(--gold)', fontSize: 13 }}>{mg.display_name} <span style={{ color: 'var(--gray)', fontSize: 11 }}>({mg.name})</span></span>
                <ToggleChip on={link.is_required} onClick={() => updateModGroupLink(link.id, { is_required: !link.is_required })} label="Required" />
                <input type="number" min={0} value={link.min_selections} onChange={e => updateModGroupLink(link.id, { min_selections: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, width: 50, padding: '4px 8px', fontSize: 12 }} title="Min" />
                <input type="number" min={1} value={link.max_selections} onChange={e => updateModGroupLink(link.id, { max_selections: parseInt(e.target.value) || 1 })} style={{ ...inputStyle, width: 50, padding: '4px 8px', fontSize: 12 }} title="Max" />
                <button onClick={() => removeModGroupLink(link.id)} style={miniBtn}><Trash2 size={12} /></button>
              </div>
            )
          })}
          {unlinkedMgs.length > 0 && (
            <select onChange={e => { if (e.target.value) { addModGroupLink(e.target.value); e.target.value = '' } }} style={{ ...inputStyle, marginTop: 8, fontSize: 12, padding: '6px 10px' }} value="">
              <option value="">+ Add modifier group…</option>
              {unlinkedMgs.map(g => <option key={g.id} value={g.id}>{g.display_name}</option>)}
            </select>
          )}
          <p style={{ color: 'var(--gray)', fontSize: 10, marginTop: 6, fontStyle: 'italic' }}>
            <Plus size={10} style={{ display: 'inline' }} /> Manage groups + choices in Menu Data tab.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#ef4444' }}>Delete this item?</span>
              <button onClick={handleDelete} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Yes, Delete</button>
              <button onClick={() => setConfirmDelete(false)} style={{ background: 'none', color: 'var(--gray)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ background: 'none', border: 'none', color: '#ef4444', opacity: 0.6, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPreviewOpen(true)} style={{ background: 'transparent', color: '#60a5fa', border: '1px solid #60a5fa', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Eye size={14} /> Preview
            </button>
            <button onClick={handleSave} disabled={saving || !name || !price} style={{ background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: saving || !name || !price ? 0.5 : 1 }}>
              <Check size={16} /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {previewOpen && (() => {
        // Synthesize a customer-facing item from staged + linked state.
        const stagedItem: MenuItem = {
          ...item,
          name, description,
          price: parseFloat(price) || 0,
          category_id: categoryId,
        }
        const customizerModifierGroups = linkedMgs
          .map(link => {
            const group = allModGroups.find(g => g.id === link.modifier_group_id)
            if (!group) return null
            return {
              group,
              modifiers: allModifiers.filter(m => m.modifier_group_id === group.id),
              link,
            }
          })
          .filter((x): x is { group: ModifierGroup; modifiers: Modifier[]; link: MenuItemModifierGroup } => x !== null)

        const customizerIngredients = linkedIngs
          .map(link => {
            const ingredient = allIngredients.find(i => i.id === link.ingredient_id)
            if (!ingredient) return null
            return { ingredient, link }
          })
          .filter((x): x is { ingredient: Ingredient; link: MenuItemIngredient } => x !== null)

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 2000 }} onClick={e => e.stopPropagation()}>
            <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 2001, background: 'rgba(96,165,250,0.95)', color: '#000', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
              PREVIEW — staged changes shown, not saved
            </div>
            <CartProvider>
              <ItemCustomizer
                item={stagedItem}
                modifierGroups={customizerModifierGroups}
                itemIngredients={customizerIngredients}
                onAdd={() => setPreviewOpen(false)}
                onClose={() => setPreviewOpen(false)}
                closeOnAdd
                closeButtonLabel="Close Preview"
              />
            </CartProvider>
          </div>
        )
      })()}
    </div>
  )
}

function ToggleChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
      letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer',
      border: '1px solid', borderColor: on ? '#34d399' : 'var(--border)',
      background: on ? 'rgba(52,211,153,0.15)' : 'transparent',
      color: on ? '#34d399' : 'var(--gray)',
    }}>{label}</button>
  )
}

const linkRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
}
const miniBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2,
}
const bulkBtn: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)',
  color: 'var(--gold)', cursor: 'pointer',
}
