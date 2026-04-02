import { useState, useEffect, useCallback, useRef } from 'react'
import { FileDown, Search, X } from 'lucide-react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { MenuCategory, MenuItem } from '../types'
import MenuSection from '../components/MenuSection'
import { generateMenuPdf } from '../utils/menuPdf'

export default function Menu() {
  const { isAdmin } = useAuth()
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mealType, setMealType] = useState<'breakfast' | 'lunch_dinner'>(() => {
    const pstHour = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false })
    const hour = parseInt(pstHour, 10)
    return (hour >= 3 && hour < 10) ? 'breakfast' : 'lunch_dinner'
  })
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (filteredCategories.length > 0) {
      setActiveCategory(filteredCategories[0].id)
    }
  }, [mealType, categories.length])

  const searchLower = searchQuery.toLowerCase().trim()
  const searchedItems = searchLower
    ? items.filter(i => i.name.toLowerCase().includes(searchLower) || i.description?.toLowerCase().includes(searchLower))
    : []
  const searchedCategoryIds = Array.from(new Set(searchedItems.map(i => i.category_id)))

  const displayCategories = searchOpen && searchLower
    ? categories.filter(c => searchedCategoryIds.includes(c.id))
    : activeCategory
      ? filteredCategories.filter(c => c.id === activeCategory)
      : filteredCategories

  const displayItems = (catId: string) => {
    if (searchOpen && searchLower) {
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
            }}>Served till 12pm</span>
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
            }}>All day</span>
          </button>
        </div>
      </div>

      {/* Category Slider with Search */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        marginBottom: 32,
      }}>
        <div style={{
          flexShrink: 0,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.3s ease',
        }}>
          {searchOpen ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: isBreakfast ? '#FFFFFF' : 'var(--dark-card)',
              border: isBreakfast ? '1px solid #D4CFC3' : '1px solid var(--border)',
              borderRadius: 50,
              padding: '6px 12px',
              boxShadow: isBreakfast ? '0 2px 8px rgba(0,0,0,0.06)' : '0 2px 8px rgba(0,0,0,0.2)',
              width: '100%',
              maxWidth: 500,
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
              <button
                onClick={() => { setSearchOpen(false); setSearchQuery('') }}
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
            </div>
          ) : (
            <button
              onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 100) }}
              style={{
                background: 'none',
                border: isBreakfast ? '1px solid #D4CFC3' : '1px solid var(--border)',
                borderRadius: 50,
                width: 38,
                height: 38,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                marginRight: 8,
                transition: 'all 0.25s ease',
                color: isBreakfast ? '#8B6914' : 'var(--gold)',
              }}
            >
              <Search size={16} />
            </button>
          )}
        </div>

        {!searchOpen && (
          <div style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            scrollBehavior: 'smooth',
            padding: '8px 4px',
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
            flexWrap: 'nowrap',
          }}>
            {filteredCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  padding: '8px 20px',
                  borderRadius: 50,
                  border: activeCategory === cat.id
                    ? (isBreakfast ? '1px solid #8B6914' : '1px solid var(--gold)')
                    : (isBreakfast ? '1px solid #D4CFC3' : '1px solid var(--border)'),
                  background: activeCategory === cat.id
                    ? (isBreakfast ? 'rgba(139,105,20,0.1)' : 'rgba(200,168,78,0.12)')
                    : 'transparent',
                  color: activeCategory === cat.id
                    ? (isBreakfast ? '#8B6914' : 'var(--gold)')
                    : (isBreakfast ? '#888' : 'var(--gray)'),
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: 0.5,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.25s ease',
                  flexShrink: 0,
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
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
    </div>
  )
}
