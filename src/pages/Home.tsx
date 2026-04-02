import { useState, useEffect, useCallback, useRef } from 'react'
import { MapPin, Clock, Phone, ShoppingBag, Search, X } from 'lucide-react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { MenuCategory, MenuItem } from '../types'
import MenuSection from '../components/MenuSection'
import { generateMenuPdf } from '../utils/menuPdf'

export default function Home() {
  const { isAdmin } = useAuth()
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mealType, setMealType] = useState<'breakfast' | 'lunch_dinner'>('lunch_dinner')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)

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

  return (
    <div>
      {/* Hero */}
      <section className="hero-section" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px 40px',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(200,168,78,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <img
          className="hero-logo"
          src={isBreakfast ? '/logo-dark-transparent.png' : '/logo-white-transparent.png'}
          alt="Tacos Miranda"
          style={{
            width: 700,
            maxWidth: '90vw',
            marginBottom: 24,
            filter: isBreakfast ? 'none' : 'drop-shadow(0 0 40px rgba(200,168,78,0.1))',
            transition: 'filter 0.4s ease',
          }}
        />

        <div style={{
          width: 60,
          height: 1,
          background: 'var(--gold)',
          margin: '8px 0 20px',
        }} />


        <div style={{
          marginTop: 32,
          padding: '10px 24px',
          background: isBreakfast ? '#EEEBE3' : 'var(--dark-card)',
          border: isBreakfast ? '1px solid #D4CFC3' : '1px solid var(--border)',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          transition: 'all 0.4s ease',
        }}>
          <ShoppingBag size={16} color={isBreakfast ? '#8B6914' : 'var(--gold)'} />
          <span style={{ color: isBreakfast ? '#8B6914' : 'var(--gold)', fontSize: 13, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', transition: 'color 0.4s ease' }}>
            Online Ordering - Coming Soon
          </span>
        </div>

        <a
          href="tel:6578454011"
          style={{
            marginTop: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '16px 36px',
            background: isBreakfast ? '#1a1a1a' : 'var(--gold)',
            border: 'none',
            borderRadius: 8,
            color: isBreakfast ? '#FAF8F3' : 'var(--black)',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 1,
            textDecoration: 'none',
            textTransform: 'uppercase',
            boxShadow: isBreakfast ? '0 4px 16px rgba(0,0,0,0.15)' : '0 4px 16px rgba(200,168,78,0.3)',
            transition: 'all 0.4s ease',
            width: 'fit-content',
            maxWidth: '90vw',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = isBreakfast ? '0 6px 24px rgba(0,0,0,0.25)' : '0 6px 24px rgba(200,168,78,0.5)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = isBreakfast ? '0 4px 16px rgba(0,0,0,0.15)' : '0 4px 16px rgba(200,168,78,0.3)' }}
        >
          <Phone size={18} />
          <span>Tap to Call & Order</span>
        </a>
        <p style={{ color: isBreakfast ? '#888' : 'var(--gray)', fontSize: 14, marginTop: 8, letterSpacing: 1, transition: 'color 0.4s ease' }}>(657) 845-4011</p>
      </section>


      {/* Menu */}
      <section id="menu" className="menu-section" style={{
        padding: '40px 24px 80px',
        maxWidth: 1200,
        margin: '0 auto',
      }}>
        <h1 className="menu-heading" style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 40,
          color: mealType === 'breakfast' ? '#1a1a1a' : 'var(--white)',
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
                background: mealType === 'lunch_dinner' ? (isBreakfast ? '#1a1a1a' : 'var(--gold)') : 'transparent',
                color: mealType === 'lunch_dinner' ? (isBreakfast ? '#FAF8F3' : 'var(--black)') : (isBreakfast ? '#999' : '#888'),
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
          gap: 0,
          marginBottom: 32,
          position: 'relative',
        }}>
          {/* Search Icon / Expanded Bar */}
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

          {/* Category Pills */}
          {!searchOpen && (
            <div
              ref={sliderRef}
              style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                scrollBehavior: 'smooth',
                padding: '8px 4px',
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
                flexWrap: 'nowrap',
              }}
            >
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

        {loading ? (
          <p style={{ color: 'var(--gray)', fontSize: 14, textAlign: 'center' }}>Loading menu...</p>
        ) : (
          <div className="menu-grid" style={{
            display: 'grid',
            gridTemplateColumns: displayCategories.length === 1 ? '1fr' : 'repeat(3, 1fr)',
            gap: 24,
            maxWidth: displayCategories.length === 1 ? 700 : 1200,
            margin: '0 auto',
          }}>
            {displayCategories.map(cat => (
              <div
                key={cat.id}
                style={{
                  background: mealType === 'breakfast' ? '#FFFFFF' : 'var(--dark-card)',
                  borderRadius: 12,
                  padding: '24px 20px',
                  borderTop: mealType === 'breakfast' ? '2px solid #8B6914' : '2px solid var(--gold)',
                  boxShadow: mealType === 'breakfast' ? '0 2px 12px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.4s ease',
                }}
              >
                <MenuSection
                  category={cat}
                  items={displayItems(cat.id)}
                  isAdmin={isAdmin}
                  onUpdate={fetchMenu}
                  light={isBreakfast}
                />
              </div>
            ))}
          </div>
        )}

      </section>

      {/* Location */}
      <section id="location" className="location-section" style={{ padding: '60px 24px 80px', maxWidth: 900, margin: '0 auto' }}>
        <h2 className="location-heading" style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 36,
          color: isBreakfast ? '#1a1a1a' : 'var(--white)',
          textAlign: 'center',
          letterSpacing: 4,
          marginBottom: 40,
          transition: 'color 0.4s ease',
        }}>
          Find Us
        </h2>

        <div className="location-flex" style={{
          display: 'flex',
          gap: 32,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          {/* Info */}
          <div style={{
            background: isBreakfast ? '#FFFFFF' : 'var(--dark-card)',
            borderRadius: 12,
            borderTop: isBreakfast ? '2px solid #8B6914' : '2px solid var(--gold)',
            padding: '32px 28px',
            flex: '1 1 300px',
            maxWidth: 380,
            boxShadow: isBreakfast ? '0 2px 12px rgba(0,0,0,0.06)' : 'none',
            transition: 'all 0.4s ease',
          }}
          className="location-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <MapPin size={20} color={isBreakfast ? '#8B6914' : 'var(--gold)'} />
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, color: isBreakfast ? '#1a1a1a' : 'var(--white)', transition: 'color 0.4s ease' }}>Location</h3>
            </div>
            <a
              href="https://www.google.com/maps/place/Tacos+Miranda/@33.6493169,-117.95565,17z"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: isBreakfast ? '#333' : 'var(--white)',
                fontSize: 15,
                lineHeight: 1.6,
                display: 'block',
                marginBottom: 28,
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = isBreakfast ? '#8B6914' : 'var(--gold)'}
              onMouseLeave={e => e.currentTarget.style.color = isBreakfast ? '#333' : 'var(--white)'}
            >
              21582 Brookhurst St<br />
              Huntington Beach, CA 92646
            </a>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Clock size={20} color={isBreakfast ? '#8B6914' : 'var(--gold)'} />
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, color: isBreakfast ? '#1a1a1a' : 'var(--white)', transition: 'color 0.4s ease' }}>Hours</h3>
            </div>
            <div style={{ fontSize: 14, color: isBreakfast ? '#666' : 'var(--gray)', lineHeight: 2, transition: 'color 0.4s ease' }}>
              <p>Monday - Sunday</p>
              <p style={{ color: isBreakfast ? '#1a1a1a' : 'var(--white)', fontWeight: 600, fontSize: 16, transition: 'color 0.4s ease' }}>7 AM - 9 PM</p>
              <p style={{ color: isBreakfast ? '#8B6914' : 'var(--gold)', fontSize: 13, marginTop: 8, fontStyle: 'italic', transition: 'color 0.4s ease' }}>Open 7 days a week</p>
            </div>
          </div>

          {/* Map */}
          <a
            className="location-map"
            href="https://www.google.com/maps/place/Tacos+Miranda/@33.6493169,-117.95565,17z"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: '1 1 400px',
              maxWidth: 500,
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid var(--border)',
              display: 'block',
              position: 'relative',
            }}
          >
            <img
              src="/map.png"
              alt="Tacos Miranda - 21582 Brookhurst St, Huntington Beach, CA"
              style={{ width: '100%', display: 'block' }}
              loading="lazy"
            />
            <div style={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              background: 'var(--gold)',
              color: 'var(--black)',
              padding: '8px 16px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}>
              Get Directions
            </div>
          </a>
        </div>
      </section>

    </div>
  )
}
