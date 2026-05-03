import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../config/supabase'
import { Loader2, Plus, Trash2, EyeOff, Eye, ChevronUp, ChevronDown, Save, X } from 'lucide-react'
import { Ingredient, IngredientCategory, Modifier, ModifierGroup } from '../types'
import { safeDeleteOrArchive } from '../utils/safeDelete'

type Tab = 'ingredients' | 'categories' | 'modifier_groups'

export default function AdminMenuData() {
  const { user, isAdmin, loading } = useAuth()
  const [tab, setTab] = useState<Tab>('ingredients')
  const [busy, setBusy] = useState(false)

  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [categories, setCategories] = useState<IngredientCategory[]>([])
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([])
  const [modifiers, setModifiers] = useState<Modifier[]>([])

  const reload = useCallback(async () => {
    setBusy(true)
    const [iRes, cRes, mgRes, mRes] = await Promise.all([
      supabase.from('ingredients').select('*').order('sort_order'),
      supabase.from('ingredient_categories').select('*').order('sort_order'),
      supabase.from('modifier_groups').select('*').order('sort_order'),
      supabase.from('modifiers').select('*').order('sort_order'),
    ])
    if (iRes.data) setIngredients(iRes.data as Ingredient[])
    if (cRes.data) setCategories(cRes.data as IngredientCategory[])
    if (mgRes.data) setModifierGroups(mgRes.data as ModifierGroup[])
    if (mRes.data) setModifiers(mRes.data as Modifier[])
    setBusy(false)
  }, [])

  useEffect(() => { if (!loading && user && isAdmin) reload() }, [loading, user, isAdmin, reload])

  if (loading) return <div style={wrap}><Loader2 className="spin" size={24} /> Loading…</div>
  if (!user || !isAdmin) return <div style={wrap}><h1 style={{ color: 'var(--gold)' }}>Not authorized</h1></div>

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ color: 'var(--gold)', fontFamily: 'var(--font-heading)', margin: '0 0 8px' }}>Menu Data</h1>
        <p style={{ color: 'var(--gray)', marginBottom: 24 }}>
          Manage ingredients, categories, and modifier groups. Items with order history are archived (86'd) instead of deleted to preserve receipts.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <TabBtn active={tab === 'ingredients'} onClick={() => setTab('ingredients')}>Ingredients ({ingredients.length})</TabBtn>
          <TabBtn active={tab === 'categories'} onClick={() => setTab('categories')}>Categories ({categories.length})</TabBtn>
          <TabBtn active={tab === 'modifier_groups'} onClick={() => setTab('modifier_groups')}>Modifier Groups ({modifierGroups.length})</TabBtn>
        </div>

        {busy && <div style={{ color: 'var(--gray)', marginBottom: 12 }}><Loader2 className="spin" size={14} /> Working…</div>}

        {tab === 'ingredients' && <IngredientsPane ingredients={ingredients} categories={categories} reload={reload} />}
        {tab === 'categories' && <CategoriesPane categories={categories} ingredients={ingredients} reload={reload} />}
        {tab === 'modifier_groups' && <ModifierGroupsPane groups={modifierGroups} modifiers={modifiers} reload={reload} />}
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ============ Ingredients ============

function IngredientsPane({ ingredients, categories, reload }: { ingredients: Ingredient[]; categories: IngredientCategory[]; reload: () => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id || '')

  const add = async () => {
    if (!name.trim() || !categoryId) return
    const cat = categories.find(c => c.id === categoryId)
    const maxOrder = Math.max(0, ...ingredients.map(i => i.sort_order)) + 10
    const { error } = await supabase.from('ingredients').insert({
      name: name.trim(),
      category: cat?.name || '',
      category_id: categoryId,
      sort_order: maxOrder,
    })
    if (error) { alert(error.message); return }
    setName(''); setAdding(false); reload()
  }

  const grouped = categories.map(c => ({
    category: c,
    items: ingredients.filter(i => i.category_id === c.id).sort((a, b) => a.sort_order - b.sort_order),
  }))
  const orphans = ingredients.filter(i => !i.category_id)

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={h2}>Ingredients</h2>
        {!adding ? (
          <button onClick={() => setAdding(true)} style={addBtn}><Plus size={14} /> Add ingredient</button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={input} onKeyDown={e => e.key === 'Enter' && add()} />
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={input}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={add} style={saveBtn}><Save size={14} /></button>
            <button onClick={() => { setAdding(false); setName('') }} style={cancelBtn}><X size={14} /></button>
          </div>
        )}
      </div>

      {grouped.map(g => (
        <div key={g.category.id} style={{ marginBottom: 20 }}>
          <div style={catLabel}>{g.category.name}</div>
          {g.items.map(i => <IngredientRow key={i.id} ing={i} categories={categories} reload={reload} />)}
        </div>
      ))}
      {orphans.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ ...catLabel, color: '#ef4444' }}>Uncategorized</div>
          {orphans.map(i => <IngredientRow key={i.id} ing={i} categories={categories} reload={reload} />)}
        </div>
      )}
    </div>
  )
}

function IngredientRow({ ing, categories, reload }: { ing: Ingredient; categories: IngredientCategory[]; reload: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(ing.name)
  const [categoryId, setCategoryId] = useState(ing.category_id || '')

  const save = async () => {
    const cat = categories.find(c => c.id === categoryId)
    const { error } = await supabase.from('ingredients').update({
      name: name.trim(),
      category: cat?.name || '',
      category_id: categoryId,
    }).eq('id', ing.id)
    if (error) { alert(error.message); return }
    setEditing(false); reload()
  }

  const toggle86 = async () => {
    await supabase.from('ingredients').update({ is_86: !ing.is_86 }).eq('id', ing.id)
    reload()
  }

  const remove = async () => {
    if (!confirm(`Delete ${ing.name}?`)) return
    const result = await safeDeleteOrArchive({
      table: 'ingredients', id: ing.id,
      refTable: 'order_item_ingredients', refColumn: 'ingredient_id',
    })
    if (result.kind === 'error') { alert(result.message); return }
    if (result.kind === 'archived') alert(`${ing.name} has ${result.refCount} past order reference${result.refCount === 1 ? '' : 's'}, archived (86'd) instead.`)
    reload()
  }

  return (
    <div style={{ ...row, opacity: ing.is_86 ? 0.55 : 1 }}>
      {editing ? (
        <>
          <input value={name} onChange={e => setName(e.target.value)} style={{ ...input, flex: 1 }} />
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={input}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={save} style={saveBtn}><Save size={14} /></button>
          <button onClick={() => { setEditing(false); setName(ing.name); setCategoryId(ing.category_id || '') }} style={cancelBtn}><X size={14} /></button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, color: 'var(--gold)', textDecoration: ing.is_86 ? 'line-through' : 'none' }}>{ing.name}</span>
          {ing.is_86 && <span style={badge86}>86'D</span>}
          <button onClick={() => setEditing(true)} style={iconBtn} title="Edit">Edit</button>
          <button onClick={toggle86} style={{ ...iconBtn, color: ing.is_86 ? '#4ade80' : '#ef4444' }} title={ing.is_86 ? 'Bring back' : '86'}>
            {ing.is_86 ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button onClick={remove} style={{ ...iconBtn, color: '#ef4444' }} title="Delete"><Trash2 size={13} /></button>
        </>
      )}
    </div>
  )
}

// ============ Categories ============

function CategoriesPane({ categories, ingredients, reload }: { categories: IngredientCategory[]; ingredients: Ingredient[]; reload: () => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const add = async () => {
    if (!name.trim()) return
    const maxOrder = Math.max(0, ...categories.map(c => c.sort_order)) + 10
    const { error } = await supabase.from('ingredient_categories').insert({ name: name.trim(), sort_order: maxOrder })
    if (error) { alert(error.message); return }
    setName(''); setAdding(false); reload()
  }

  const move = async (cat: IngredientCategory, dir: -1 | 1) => {
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(c => c.id === cat.id)
    const swap = sorted[idx + dir]
    if (!swap) return
    await Promise.all([
      supabase.from('ingredient_categories').update({ sort_order: swap.sort_order }).eq('id', cat.id),
      supabase.from('ingredient_categories').update({ sort_order: cat.sort_order }).eq('id', swap.id),
    ])
    reload()
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={h2}>Ingredient Categories</h2>
        {!adding ? (
          <button onClick={() => setAdding(true)} style={addBtn}><Plus size={14} /> Add category</button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Starches" style={input} onKeyDown={e => e.key === 'Enter' && add()} />
            <button onClick={add} style={saveBtn}><Save size={14} /></button>
            <button onClick={() => { setAdding(false); setName('') }} style={cancelBtn}><X size={14} /></button>
          </div>
        )}
      </div>

      {[...categories].sort((a, b) => a.sort_order - b.sort_order).map(c => (
        <CategoryRow key={c.id} cat={c} count={ingredients.filter(i => i.category_id === c.id).length} onMove={(d) => move(c, d)} reload={reload} />
      ))}
    </div>
  )
}

function CategoryRow({ cat, count, onMove, reload }: { cat: IngredientCategory; count: number; onMove: (d: -1 | 1) => void; reload: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(cat.name)

  const save = async () => {
    const newName = name.trim()
    if (!newName) return
    const { error } = await supabase.from('ingredient_categories').update({ name: newName }).eq('id', cat.id)
    if (error) { alert(error.message); return }
    // Cascade: keep ingredients.category text in sync so customer-side UI updates.
    await supabase.from('ingredients').update({ category: newName }).eq('category_id', cat.id)
    setEditing(false); reload()
  }

  const toggle86 = async () => {
    await supabase.from('ingredient_categories').update({ is_86: !cat.is_86 }).eq('id', cat.id)
    reload()
  }

  const remove = async () => {
    if (count > 0) { alert(`${cat.name} has ${count} ingredient${count === 1 ? '' : 's'}. Reassign or delete them first.`); return }
    if (!confirm(`Delete category ${cat.name}?`)) return
    const { error } = await supabase.from('ingredient_categories').delete().eq('id', cat.id)
    if (error) { alert(error.message); return }
    reload()
  }

  return (
    <div style={{ ...row, opacity: cat.is_86 ? 0.55 : 1 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <button onClick={() => onMove(-1)} style={moveBtn}><ChevronUp size={12} /></button>
        <button onClick={() => onMove(1)} style={moveBtn}><ChevronDown size={12} /></button>
      </div>
      {editing ? (
        <>
          <input value={name} onChange={e => setName(e.target.value)} style={{ ...input, flex: 1 }} onKeyDown={e => e.key === 'Enter' && save()} />
          <button onClick={save} style={saveBtn}><Save size={14} /></button>
          <button onClick={() => { setEditing(false); setName(cat.name) }} style={cancelBtn}><X size={14} /></button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, color: 'var(--gold)', textDecoration: cat.is_86 ? 'line-through' : 'none', textTransform: 'capitalize' }}>{cat.name}</span>
          <span style={{ color: 'var(--gray)', fontSize: 12 }}>{count} item{count === 1 ? '' : 's'}</span>
          <button onClick={() => setEditing(true)} style={iconBtn}>Edit</button>
          <button onClick={toggle86} style={{ ...iconBtn, color: cat.is_86 ? '#4ade80' : '#ef4444' }}>
            {cat.is_86 ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button onClick={remove} style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={13} /></button>
        </>
      )}
    </div>
  )
}

// ============ Modifier Groups ============

function ModifierGroupsPane({ groups, modifiers, reload }: { groups: ModifierGroup[]; modifiers: Modifier[]; reload: () => void }) {
  const [adding, setAdding] = useState(false)
  const [displayName, setDisplayName] = useState('')

  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  const add = async () => {
    if (!displayName.trim()) return
    const maxOrder = Math.max(0, ...groups.map(g => g.sort_order)) + 10
    const { error } = await supabase.from('modifier_groups').insert({
      name: slugify(displayName), display_name: displayName.trim(), sort_order: maxOrder,
    })
    if (error) { alert(error.message); return }
    setDisplayName(''); setAdding(false); reload()
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={h2}>Modifier Groups</h2>
        {!adding ? (
          <button onClick={() => setAdding(true)} style={addBtn}><Plus size={14} /> Add group</button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input autoFocus value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Heat Level" style={input} onKeyDown={e => e.key === 'Enter' && add()} />
            <button onClick={add} style={saveBtn}><Save size={14} /></button>
            <button onClick={() => { setAdding(false); setDisplayName('') }} style={cancelBtn}><X size={14} /></button>
          </div>
        )}
      </div>

      {groups.map(g => (
        <ModifierGroupRow key={g.id} group={g} modifiers={modifiers.filter(m => m.modifier_group_id === g.id)} reload={reload} />
      ))}
    </div>
  )
}

function ModifierGroupRow({ group, modifiers, reload }: { group: ModifierGroup; modifiers: Modifier[]; reload: () => void }) {
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(group.display_name)
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newModName, setNewModName] = useState('')
  const [newModUpcharge, setNewModUpcharge] = useState('0')

  const saveGroup = async () => {
    const { error } = await supabase.from('modifier_groups').update({ display_name: displayName.trim() }).eq('id', group.id)
    if (error) { alert(error.message); return }
    setEditing(false); reload()
  }

  const removeGroup = async () => {
    if (modifiers.length > 0) { alert(`${group.display_name} has ${modifiers.length} choice${modifiers.length === 1 ? '' : 's'}. Delete or reassign them first.`); return }
    if (!confirm(`Delete modifier group ${group.display_name}?`)) return
    const { error } = await supabase.from('modifier_groups').delete().eq('id', group.id)
    if (error) { alert(error.message); return }
    reload()
  }

  const addModifier = async () => {
    if (!newModName.trim()) return
    const maxOrder = Math.max(0, ...modifiers.map(m => m.sort_order)) + 10
    const { error } = await supabase.from('modifiers').insert({
      modifier_group_id: group.id,
      name: newModName.trim(),
      upcharge: parseFloat(newModUpcharge) || 0,
      sort_order: maxOrder,
    })
    if (error) { alert(error.message); return }
    setNewModName(''); setNewModUpcharge('0'); setAdding(false); reload()
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => setExpanded(!expanded)} style={iconBtn}>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
        {editing ? (
          <>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={{ ...input, flex: 1 }} onKeyDown={e => e.key === 'Enter' && saveGroup()} />
            <button onClick={saveGroup} style={saveBtn}><Save size={14} /></button>
            <button onClick={() => { setEditing(false); setDisplayName(group.display_name) }} style={cancelBtn}><X size={14} /></button>
          </>
        ) : (
          <>
            <span style={{ flex: 1, color: 'var(--gold)', fontWeight: 600 }}>{group.display_name}</span>
            <span style={{ color: 'var(--gray)', fontSize: 11 }}>slug: {group.name}</span>
            <span style={{ color: 'var(--gray)', fontSize: 12 }}>{modifiers.length} choice{modifiers.length === 1 ? '' : 's'}</span>
            <button onClick={() => setEditing(true)} style={iconBtn}>Edit</button>
            <button onClick={removeGroup} style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={13} /></button>
          </>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingLeft: 22 }}>
          {modifiers.sort((a, b) => a.sort_order - b.sort_order).map(m => <ModifierRow key={m.id} mod={m} reload={reload} />)}
          {!adding ? (
            <button onClick={() => setAdding(true)} style={{ ...addBtn, marginTop: 6 }}><Plus size={12} /> Add choice</button>
          ) : (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input autoFocus value={newModName} onChange={e => setNewModName(e.target.value)} placeholder="Choice name" style={{ ...input, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addModifier()} />
              <input type="number" step="0.01" value={newModUpcharge} onChange={e => setNewModUpcharge(e.target.value)} placeholder="0.00" style={{ ...input, width: 80 }} />
              <button onClick={addModifier} style={saveBtn}><Save size={14} /></button>
              <button onClick={() => { setAdding(false); setNewModName(''); setNewModUpcharge('0') }} style={cancelBtn}><X size={14} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ModifierRow({ mod, reload }: { mod: Modifier; reload: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(mod.name)
  const [upcharge, setUpcharge] = useState(mod.upcharge.toString())

  const save = async () => {
    const { error } = await supabase.from('modifiers').update({
      name: name.trim(), upcharge: parseFloat(upcharge) || 0,
    }).eq('id', mod.id)
    if (error) { alert(error.message); return }
    setEditing(false); reload()
  }

  const toggle86 = async () => {
    await supabase.from('modifiers').update({ is_86: !mod.is_86 }).eq('id', mod.id)
    reload()
  }

  const remove = async () => {
    if (!confirm(`Delete ${mod.name}?`)) return
    const result = await safeDeleteOrArchive({
      table: 'modifiers', id: mod.id,
      refTable: 'order_item_modifiers', refColumn: 'modifier_id',
    })
    if (result.kind === 'error') { alert(result.message); return }
    if (result.kind === 'archived') alert(`${mod.name} has ${result.refCount} past reference${result.refCount === 1 ? '' : 's'}, archived instead.`)
    reload()
  }

  return (
    <div style={{ ...row, opacity: mod.is_86 ? 0.55 : 1, padding: '6px 0' }}>
      {editing ? (
        <>
          <input value={name} onChange={e => setName(e.target.value)} style={{ ...input, flex: 1 }} />
          <input type="number" step="0.01" value={upcharge} onChange={e => setUpcharge(e.target.value)} style={{ ...input, width: 80 }} />
          <button onClick={save} style={saveBtn}><Save size={14} /></button>
          <button onClick={() => { setEditing(false); setName(mod.name); setUpcharge(mod.upcharge.toString()) }} style={cancelBtn}><X size={14} /></button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, color: 'var(--gold)', textDecoration: mod.is_86 ? 'line-through' : 'none' }}>{mod.name}</span>
          <span style={{ color: '#34d399', fontSize: 13, minWidth: 60, textAlign: 'right' }}>+${mod.upcharge.toFixed(2)}</span>
          <button onClick={() => setEditing(true)} style={iconBtn}>Edit</button>
          <button onClick={toggle86} style={{ ...iconBtn, color: mod.is_86 ? '#4ade80' : '#ef4444' }}>
            {mod.is_86 ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button onClick={remove} style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={13} /></button>
        </>
      )}
    </div>
  )
}

// ============ shared bits ============

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px',
      border: '1px solid var(--border)',
      borderRadius: 8,
      background: active ? '#a78bfa' : 'transparent',
      color: active ? '#000' : 'var(--gold)',
      cursor: 'pointer',
      fontSize: 13,
      fontWeight: active ? 700 : 500,
    }}>
      {children}
    </button>
  )
}

const wrap: React.CSSProperties = { padding: 32, minHeight: '80vh', background: 'var(--bg)' }
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 24, marginBottom: 24,
}
const h2: React.CSSProperties = { color: 'var(--gold)', fontFamily: 'var(--font-heading)', fontSize: 20, margin: 0 }
const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
}
const catLabel: React.CSSProperties = {
  color: '#888', fontSize: 11, fontWeight: 600, letterSpacing: 1,
  textTransform: 'uppercase', marginBottom: 6, marginTop: 4,
}
const input: React.CSSProperties = {
  padding: '6px 10px', background: 'var(--dark-input, rgba(0,0,0,0.3))',
  border: '1px solid var(--border)', borderRadius: 6, color: 'var(--white)',
  fontSize: 13, outline: 'none',
}
const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer',
  padding: '4px 8px', fontSize: 12, opacity: 0.8,
}
const moveBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer',
  padding: 0, lineHeight: 0.8,
}
const addBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 12px', border: '1px solid var(--gold)', borderRadius: 6,
  background: 'transparent', color: 'var(--gold)', cursor: 'pointer', fontSize: 12,
}
const saveBtn: React.CSSProperties = {
  background: '#34d399', border: 'none', borderRadius: 6, color: '#000',
  cursor: 'pointer', padding: '6px 10px',
}
const cancelBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--gray)', cursor: 'pointer', padding: '6px 10px',
}
const badge86: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
  background: 'rgba(239,68,68,0.15)', color: '#ef4444',
  padding: '2px 6px', borderRadius: 4,
}
