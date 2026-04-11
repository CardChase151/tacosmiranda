import { useState, useEffect, useCallback, useRef } from 'react'
import { FileDown, Search, X, Plus, Check, ArrowUpDown } from 'lucide-react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { MenuCategory, MenuItem } from '../types'
import MenuSection from '../components/MenuSection'
import RearrangeMenu from '../components/RearrangeMenu'
import { generateMenuPdf } from '../utils/menuPdf'

export default function Menu() {
  const { isAdmin } = useAuth()
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mealType, setMealType] = useState<'breakfast' | 'lunch_dinner'>(() => {
    const pstHour = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false })
    const hour = parseInt(pstHour, 10)
    // Before 10am only breakfast is available, so default to it.
    // After 10am default to lunch/dinner (breakfast still selectable all day).
    return hour < 10 ? 'breakfast' : 'lunch_dinner'
  })
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [rearranging, setRearranging] = useState(false)

  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) return
    const maxSort = categories
      .filter(c => c.meal_type === mealType)
      .reduce((max, c) => Math.max(max, c.sort_order), 0)
    await supabase.from('menu_categories').insert({
      name: trimmed,
      meal_type: mealType,
      sort_order: maxSort + 1,
    })
    setNewCategoryName('')
    setAddingCategory(false)
    fetchMenu()
  }

  const fetchMenu = useCallback(async () => {
    const [catRes, itemRes] = await Promise.all([
      supabase.from('menu_categories').select('*').order('sort_order'),
      supabase.from('menu_items').select('*').order('sort_order'),
    ])
    if (catRes.data) setCategories(catRes.data)
    if (itemRes.data) setItems(itemRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchMenu() }, [fetchMenu])

  const isBreakfast = mealType === 'breakfast'

  useEffect(() => {
    document.body.style.transition = 'background-color 0.4s ease, color 0.4s ease'
    if (isBreakfast) {
      document.body.style.backgroundColor = '#FAF8F3'
      document.body.style.color = '#1a1a1a'
      document.body.setAttribute('data-theme', 'breakfast')
    } else {
      document.body.style.backgroundColor = 'var(--black)'
      document.body.style.color = 'var(--white)'
      document.body.setAttribute('data-theme', 'dark')
    }
  }, [isBreakfast])

  const filteredCategories = categories.filter(c => c.meal_type === mealType)

  const searchLower = searchQuery.toLowerCase().trim()
  const searchedItems = searchLower
    ? items.filter(i => i.name.toLowerCase().includes(searchLower) || i.description?.toLowerCase().includes(searchLower))
    : []
  const searchedCategoryIds = Array.from(new Set(searchedItems.map(i => i.category_id)))

  const displayCategories = searchLower
    ? categories.filter(c => searchedCategoryIds.includes(c.id))
    : filteredCategories

  const displayItems = (catId: string) => {
    if (searchLower) {
      return searchedItems.filter(i => i.category_id === catId)
    }
    return items.filter(i => i.category_id === catId)
  }

  const handleDownloadPdf = () => {
    generateMenuPdf(categories, items)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--gray)', fontSize: 14 }}>Loading menu...</p>
      </div>
    )
  }

  return (
    <div style={{
      padding: '40px 24px 100px',
      maxWidth: 800,
      margin: '0 auto',
    }}>
      <h1 style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 40,
        color: isBreakfast ? '#1a1a1a' : 'var(--white)',
        textAlign: 'center',
        letterSpacing: 4,
        marginBottom: 8,
        transition: 'color 0.4s ease',
      }}>
        Our Menu
      </h1>

      {/* Breakfast / Lunch+Dinner Toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginTop: 24,
        marginBottom: 8,
      }}>
        <div style={{
          display: 'flex',
          background: isBreakfast ? '#FFFFFF' : 'var(--dark-card)',
          borderRadius: 50,
          padding: 4,
          border: isBreakfast ? '1px solid #D4CFC3' : '1px solid var(--border)',
          boxShadow: isBreakfast ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
          transition: 'all 0.4s ease',
        }}>
          <button
            onClick={() => setMealType('breakfast')}
            style={{
              padding: '10px 28px',
              borderRadius: 50,
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 0.5,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              background: isBreakfast ? '#1a1a1a' : 'transparent',
              color: isBreakfast ? '#FAF8F3' : 'var(--gray)',
            }}
          >
            Breakfast
            <span style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 400,
              opacity: 0.7,
              marginTop: 1,
            }}>Served all day</span>
          </button>
          <button
            onClick={() => setMealType('lunch_dinner')}
            style={{
              padding: '10px 28px',
              borderRadius: 50,
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 0.5,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              background: !isBreakfast ? 'var(--gold)' : 'transparent',
              color: !isBreakfast ? 'var(--black)' : '#999',
            }}
          >
            Lunch & Dinner
            <span style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 400,
              opacity: 0.7,
              marginTop: 1,
            }}>Starting at 10am</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: 32,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: isBreakfast ? '#FFFFFF' : 'var(--dark-card)',
          border: isBreakfast ? '1px solid #D4CFC3' : '1px solid var(--border)',
          borderRadius: 50,
          padding: '8px 16px',
          boxShadow: isBreakfast ? '0 2px 8px rgba(0,0,0,0.06)' : '0 2px 8px rgba(0,0,0,0.2)',
          width: '100%',
          maxWidth: 400,
          transition: 'all 0.4s ease',
        }}>
          <Search size={16} color={isBreakfast ? '#8B6914' : 'var(--gold)'} style={{ flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search menu..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: isBreakfast ? '#1a1a1a' : 'var(--white)',
              fontSize: 14,
              fontFamily: 'var(--font-body)',
              width: '100%',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                color: isBreakfast ? '#888' : 'var(--gray)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {displayCategories.map(cat => (
        <MenuSection
          key={cat.id}
          category={cat}
          items={displayItems(cat.id)}
          isAdmin={isAdmin}
          onUpdate={fetchMenu}
          light={isBreakfast}
          allCategories={categories}
        />
      ))}

      {isAdmin && (
        <div style={{ maxWidth: 600, margin: '32px auto 0' }}>
          {!addingCategory ? (
            <>
              <button
                onClick={() => setRearranging(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'none',
                  border: isBreakfast ? '1px dashed #D4CFC3' : '1px dashed var(--border)',
                  borderRadius: 8,
                  color: isBreakfast ? '#8B6914' : 'var(--gold)',
                  padding: '12px 16px',
                  fontSize: 13,
                  width: '100%',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}
              >
                <ArrowUpDown size={14} /> Rearrange {isBreakfast ? 'Breakfast' : 'Lunch & Dinner'} Menu
              </button>
              <button
                onClick={() => setAddingCategory(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'none',
                  border: isBreakfast ? '1px dashed #D4CFC3' : '1px dashed var(--border)',
                  borderRadius: 8,
                  color: isBreakfast ? '#8B6914' : 'var(--gold)',
                  padding: '12px 16px',
                  fontSize: 13,
                  width: '100%',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                <Plus size={14} /> Add {isBreakfast ? 'Breakfast' : 'Lunch & Dinner'} Category
              </button>
            </>
          ) : (
            <div style={{
              padding: 16,
              borderLeft: isBreakfast ? '2px solid #8B6914' : '2px solid var(--gold)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}>
              <input
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryName('') } }}
                placeholder="Category name"
                autoFocus
                style={{
                  flex: 1,
                  background: isBreakfast ? '#FFFFFF' : 'var(--dark-input)',
                  border: isBreakfast ? '1px solid #D4CFC3' : '1px solid var(--border)',
                  borderRadius: 6,
                  color: isBreakfast ? '#1a1a1a' : 'var(--white)',
                  padding: '8px 12px',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleAddCategory}
                style={{
                  background: isBreakfast ? '#8B6914' : 'var(--gold)',
                  color: isBreakfast ? '#FAF8F3' : 'var(--black)',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                }}
              >
                <Check size={14} /> Add
              </button>
              <button
                onClick={() => { setAddingCategory(false); setNewCategoryName('') }}
                style={{
                  background: 'none',
                  color: isBreakfast ? '#888' : 'var(--gray)',
                  border: isBreakfast ? '1px solid #D4CFC3' : '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* PDF Download FAB */}
      <button
        onClick={handleDownloadPdf}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--gold)',
          color: 'var(--black)',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(200,168,78,0.3)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          zIndex: 50,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.1)'
          e.currentTarget.style.boxShadow = '0 6px 24px rgba(200,168,78,0.5)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(200,168,78,0.3)'
        }}
        title="Download PDF Menu"
      >
        <FileDown size={22} />
      </button>

      {rearranging && (
        <RearrangeMenu
          categories={categories}
          items={items}
          mealType={mealType}
          light={isBreakfast}
          onClose={() => setRearranging(false)}
          onSaved={fetchMenu}
        />
      )}
    </div>
  )
}
