import { useState, useEffect, useCallback, useRef } from 'react'
import { MapPin, Clock, Phone, ShoppingBag, Search, X, Pencil, Check, Eye, EyeOff, ArrowUpDown } from 'lucide-react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { MenuCategory, MenuItem } from '../types'
import MenuSection from '../components/MenuSection'
import RearrangeMenu from '../components/RearrangeMenu'
import { generateMenuPdf } from '../utils/menuPdf'

export default function Home() {
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
  const [hours, setHours] = useState<any[]>([])
  const [hoursNote, setHoursNote] = useState('Open 7 days a week')
  const [editingHours, setEditingHours] = useState(false)
  const [tempHours, setTempHours] = useState<any[]>([])
  const [tempNote, setTempNote] = useState('')
  const [promoEnabled, setPromoEnabled] = useState(false)
  const [promoTitle, setPromoTitle] = useState('')
  const [promoItems, setPromoItems] = useState('')
  const [editingPromo, setEditingPromo] = useState(false)
  const [tempPromoTitle, setTempPromoTitle] = useState('')
  const [tempPromoItems, setTempPromoItems] = useState('')
  const [rearranging, setRearranging] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const fetchMenu = useCallback(async () => {
    const [catRes, itemRes, hoursRes, settingsRes] = await Promise.all([
      supabase.from('menu_categories').select('*').order('sort_order'),
      supabase.from('menu_items').select('*').order('sort_order'),
      supabase.from('business_hours').select('*').order('day_order'),
      supabase.from('site_settings').select('*').eq('id', 'main').single(),
    ])
    if (catRes.data) setCategories(catRes.data)
    if (itemRes.data) setItems(itemRes.data)
    if (hoursRes.data) setHours(hoursRes.data)
    if (settingsRes.data) {
      setHoursNote(settingsRes.data.hours_note)
      setPromoEnabled(settingsRes.data.promo_enabled ?? false)
      setPromoTitle(settingsRes.data.promo_title ?? '')
      setPromoItems(settingsRes.data.promo_items ?? '')
    }
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

  return (
    <div>
      {/* Promo Banner */}
      {(promoEnabled || isAdmin) && promoTitle && (
        <div style={{
          background: isBreakfast
            ? 'linear-gradient(135deg, #8B6914 0%, #A67C00 100%)'
            : 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
          border: isBreakfast ? 'none' : '1px solid var(--gold)',
          padding: '20px 24px',
          textAlign: 'center',
          position: 'relative',
          opacity: promoEnabled ? 1 : 0.5,
        }}>
          {editingPromo ? (
            <div style={{ maxWidth: 500, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                value={tempPromoTitle}
                onChange={e => setTempPromoTitle(e.target.value)}
                placeholder="Banner headline"
                autoFocus
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 6,
                  color: '#fff',
                  padding: '8px 12px',
                  fontSize: 15,
                  fontWeight: 700,
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
              <textarea
                value={tempPromoItems}
                onChange={e => setTempPromoItems(e.target.value)}
                placeholder="Items (comma separated)"
                rows={2}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 6,
                  color: '#fff',
                  padding: '8px 12px',
                  fontSize: 13,
                  textAlign: 'center',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button
                  onClick={async () => {
                    await supabase.from('site_settings').update({
                      promo_title: tempPromoTitle,
                      promo_items: tempPromoItems,
                    }).eq('id', 'main')
                    setPromoTitle(tempPromoTitle)
                    setPromoItems(tempPromoItems)
                    setEditingPromo(false)
                  }}
                  style={{
                    background: '#fff', color: '#1a1a1a', border: 'none', borderRadius: 6,
                    padding: '6px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                ><Check size={14} /> Save</button>
                <button
                  onClick={() => setEditingPromo(false)}
                  style={{
                    background: 'none', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: 6, padding: '6px 16px', fontSize: 12, cursor: 'pointer',
                  }}
                >Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <p style={{
                color: isBreakfast ? '#FAF8F3' : 'var(--gold)',
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
                margin: 0,
              }}>
                {promoTitle}
              </p>
              {promoItems && (
                <p style={{
                  color: isBreakfast ? 'rgba(250,248,243,0.85)' : 'rgba(200,168,78,0.7)',
                  fontSize: 13,
                  marginTop: 6,
                  marginBottom: 0,
                  letterSpacing: 0.5,
                }}>
                  {promoItems.split(',').map(s => s.trim()).filter(Boolean).join('  /  ')}
                </p>
              )}
              {isAdmin && (
                <div style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  display: 'flex',
                  gap: 6,
                }}>
                  <button
                    onClick={() => { setTempPromoTitle(promoTitle); setTempPromoItems(promoItems); setEditingPromo(true) }}
                    title="Edit banner"
                    style={{
                      background: 'rgba(0,0,0,0.3)', border: 'none', borderRadius: 4,
                      color: '#fff', width: 28, height: 28, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', cursor: 'pointer',
                    }}
                  ><Pencil size={14} /></button>
                  <button
                    onClick={async () => {
                      const next = !promoEnabled
                      await supabase.from('site_settings').update({ promo_enabled: next }).eq('id', 'main')
                      setPromoEnabled(next)
                    }}
                    title={promoEnabled ? 'Hide banner from public' : 'Show banner to public'}
                    style={{
                      background: 'rgba(0,0,0,0.3)', border: 'none', borderRadius: 4,
                      color: promoEnabled ? '#4ade80' : '#ef4444', width: 28, height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    }}
                  >{promoEnabled ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

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

        {/* Staff: Rearrange Menu button */}
        {isAdmin && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
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
                padding: '10px 18px',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 600,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}
            >
              <ArrowUpDown size={14} /> Rearrange {isBreakfast ? 'Breakfast' : 'Lunch & Dinner'} Menu
            </button>
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--gray)', fontSize: 14, textAlign: 'center' }}>Loading menu...</p>
        ) : (
          <div className="menu-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 24,
            maxWidth: 1200,
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
                  allCategories={categories}
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
            <div style={{ fontSize: 14, color: isBreakfast ? '#666' : 'var(--gray)', transition: 'color 0.4s ease' }}>
              {editingHours ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tempHours.map((h, i) => (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 36, fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>
                        {h.day_name.slice(0, 3)}
                      </span>
                      {h.is_closed ? (
                        <span style={{ fontSize: 13, color: 'var(--gray)', fontStyle: 'italic', flex: 1 }}>Closed</span>
                      ) : (
                        <>
                          <input
                            value={h.open_time}
                            onChange={e => { const u = [...tempHours]; u[i] = { ...u[i], open_time: e.target.value }; setTempHours(u) }}
                            style={{
                              background: 'var(--dark-input)', border: '1px solid var(--border)', borderRadius: 4,
                              color: 'var(--white)', padding: '4px 8px', fontSize: 12, outline: 'none', width: 80,
                            }}
                          />
                          <span style={{ color: 'var(--gray)', fontSize: 12 }}>-</span>
                          <input
                            value={h.close_time}
                            onChange={e => { const u = [...tempHours]; u[i] = { ...u[i], close_time: e.target.value }; setTempHours(u) }}
                            style={{
                              background: 'var(--dark-input)', border: '1px solid var(--border)', borderRadius: 4,
                              color: 'var(--white)', padding: '4px 8px', fontSize: 12, outline: 'none', width: 80,
                            }}
                          />
                        </>
                      )}
                      <button
                        onClick={() => { const u = [...tempHours]; u[i] = { ...u[i], is_closed: !u[i].is_closed }; setTempHours(u) }}
                        style={{
                          background: 'none', border: 'none', fontSize: 10, cursor: 'pointer',
                          color: h.is_closed ? 'var(--gold)' : '#ef4444', opacity: 0.7,
                        }}
                      >{h.is_closed ? 'Open' : 'Close'}</button>
                    </div>
                  ))}
                  <input
                    value={tempNote}
                    onChange={e => setTempNote(e.target.value)}
                    placeholder="Note (e.g. Open 7 days a week)"
                    style={{
                      background: 'var(--dark-input)', border: '1px solid var(--border)', borderRadius: 6,
                      color: 'var(--white)', padding: '6px 10px', fontSize: 13, outline: 'none', width: '100%', marginTop: 6,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button
                      onClick={async () => {
                        for (const h of tempHours) {
                          await supabase.from('business_hours').update({
                            open_time: h.open_time, close_time: h.close_time, is_closed: h.is_closed,
                          }).eq('id', h.id)
                        }
                        await supabase.from('site_settings').update({ hours_note: tempNote }).eq('id', 'main')
                        setHours(tempHours)
                        setHoursNote(tempNote)
                        setEditingHours(false)
                      }}
                      style={{
                        background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: 6,
                        padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >Save</button>
                    <button
                      onClick={() => setEditingHours(false)}
                      style={{
                        background: 'none', color: 'var(--gray)', border: '1px solid var(--border)', borderRadius: 6,
                        padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                      }}
                    >Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  {(() => {
                    const allSame = hours.length > 0 && hours.every(h => !h.is_closed && h.open_time === hours[0].open_time && h.close_time === hours[0].close_time)
                    if (allSame && hours.length > 0) {
                      return (
                        <>
                          <p style={{ lineHeight: 2 }}>Monday - Sunday</p>
                          <p style={{ color: isBreakfast ? '#1a1a1a' : 'var(--white)', fontWeight: 600, fontSize: 16, transition: 'color 0.4s ease' }}>{hours[0].open_time} - {hours[0].close_time}</p>
                        </>
                      )
                    }
                    return hours.map(h => (
                      <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', lineHeight: 2 }}>
                        <span>{h.day_name}</span>
                        <span style={{ color: h.is_closed ? '#ef4444' : (isBreakfast ? '#1a1a1a' : 'var(--white)'), fontWeight: 600, transition: 'color 0.4s ease' }}>
                          {h.is_closed ? 'Closed' : `${h.open_time} - ${h.close_time}`}
                        </span>
                      </div>
                    ))
                  })()}
                  {hoursNote && (
                    <p style={{ color: isBreakfast ? '#8B6914' : 'var(--gold)', fontSize: 13, marginTop: 8, fontStyle: 'italic', transition: 'color 0.4s ease' }}>{hoursNote}</p>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => { setTempHours(hours.map(h => ({ ...h }))); setTempNote(hoursNote); setEditingHours(true) }}
                      style={{
                        background: 'none', border: '1px dashed var(--border)', borderRadius: 6,
                        color: 'var(--gold)', padding: '4px 12px', fontSize: 11, marginTop: 10, cursor: 'pointer',
                        opacity: 0.7,
                      }}
                    >Edit Hours</button>
                  )}
                </>
              )}
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
