import { useState, useEffect, useCallback } from 'react'
import { Download, ArrowLeft } from 'lucide-react'
import html2canvas from 'html2canvas'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { MenuCategory, MenuItem } from '../types'

export default function PrintMenu() {
  const { isAdmin } = useAuth()
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState('')

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

  const breakfastCats = categories.filter(c => c.meal_type === 'breakfast')
  const lunchCats = categories.filter(c => c.meal_type === 'lunch_dinner')

  const getItems = (catId: string) => items.filter(i => i.category_id === catId).sort((a, b) => a.sort_order - b.sort_order)

  const handleDownload = async (elementId: string, filename: string) => {
    setDownloading(elementId)
    const el = document.getElementById(elementId)
    if (!el) return
    try {
      // Clone element out of the scaled preview so html2canvas gets full size
      const wrapper = el.parentElement
      const origTransform = wrapper?.style.transform || ''
      const origMargin = wrapper?.style.marginBottom || ''
      if (wrapper) {
        wrapper.style.transform = 'none'
        wrapper.style.marginBottom = '0'
      }
      await new Promise(r => setTimeout(r, 100))
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: null, useCORS: true, logging: false })
      if (wrapper) {
        wrapper.style.transform = origTransform
        wrapper.style.marginBottom = origMargin
      }
      const link = document.createElement('a')
      link.download = filename
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) {
      console.error('Download error:', e)
    }
    setDownloading('')
  }

  if (!isAdmin) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <p style={{ color: 'var(--gray)', fontSize: 16 }}>Admin access required</p>
        <a href="/" style={{ color: 'var(--gold)', fontSize: 14 }}>Back to site</a>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--gray)', fontSize: 14 }}>Loading menu data...</p>
      </div>
    )
  }

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', padding: '32px 24px 100px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gold)', textDecoration: 'none', fontSize: 14 }}>
          <ArrowLeft size={16} /> Back to Site
        </a>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--white)', letterSpacing: 2 }}>
          Print Menu Designer
        </h1>
        <div style={{ width: 100 }} />
      </div>

      <DesignSection title="Version 1 - Classic Elegant" subtitle="Cream for breakfast, dark + gold for lunch/dinner">
        <MenuPage id="v1-breakfast" onDownload={() => handleDownload('v1-breakfast', 'TacosMiranda_Breakfast_V1.png')} downloading={downloading} label="Breakfast">
          <V1Page cats={breakfastCats} getItems={getItems} title="Breakfast" subtitle="Served Daily Until 12pm" light />
        </MenuPage>
        <MenuPage id="v1-lunch" onDownload={() => handleDownload('v1-lunch', 'TacosMiranda_LunchDinner_V1.png')} downloading={downloading} label="Lunch & Dinner">
          <V1Page cats={lunchCats} getItems={getItems} title="Lunch & Dinner" subtitle="Served All Day" />
        </MenuPage>
      </DesignSection>

      <DesignSection title="Version 2 - Modern Minimal" subtitle="Cream for breakfast, dark + gold for lunch/dinner">
        <MenuPage id="v2-breakfast" onDownload={() => handleDownload('v2-breakfast', 'TacosMiranda_Breakfast_V2.png')} downloading={downloading} label="Breakfast">
          <V2Page cats={breakfastCats} getItems={getItems} title="Breakfast" subtitle="Served Daily Until 12pm" light />
        </MenuPage>
        <MenuPage id="v2-lunch" onDownload={() => handleDownload('v2-lunch', 'TacosMiranda_LunchDinner_V2.png')} downloading={downloading} label="Lunch & Dinner">
          <V2Page cats={lunchCats} getItems={getItems} title="Lunch & Dinner" subtitle="Served All Day" />
        </MenuPage>
      </DesignSection>

      <DesignSection title="Version 3 - Warm Rustic" subtitle="Cream for breakfast, dark + gold for lunch/dinner">
        <MenuPage id="v3-breakfast" onDownload={() => handleDownload('v3-breakfast', 'TacosMiranda_Breakfast_V3.png')} downloading={downloading} label="Breakfast">
          <V3Page cats={breakfastCats} getItems={getItems} title="Breakfast" subtitle="Served Daily Until 12pm" light />
        </MenuPage>
        <MenuPage id="v3-lunch" onDownload={() => handleDownload('v3-lunch', 'TacosMiranda_LunchDinner_V3.png')} downloading={downloading} label="Lunch & Dinner">
          <V3Page cats={lunchCats} getItems={getItems} title="Lunch & Dinner" subtitle="Served All Day" />
        </MenuPage>
      </DesignSection>
    </div>
  )
}

function DesignSection({ title, subtitle, children }: { title: string, subtitle: string, children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto 80px' }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, color: 'var(--gold)', marginBottom: 4 }}>{title}</h2>
      <p style={{ color: 'var(--gray)', fontSize: 13, marginBottom: 24 }}>{subtitle}</p>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  )
}

function MenuPage({ id, onDownload, downloading, label, children }: { id: string, onDownload: () => void, downloading: string, label: string, children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <p style={{ color: 'var(--gray)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</p>
      <div style={{ transform: 'scale(0.35)', transformOrigin: 'top center', marginBottom: -500 }}>
        <div id={id}>{children}</div>
      </div>
      <button
        onClick={onDownload}
        disabled={downloading === id}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: 8,
          padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          opacity: downloading === id ? 0.5 : 1,
        }}
      >
        <Download size={14} /> {downloading === id ? 'Generating...' : 'Download'}
      </button>
    </div>
  )
}

interface PageProps {
  cats: MenuCategory[]
  getItems: (catId: string) => MenuItem[]
  title: string
  subtitle: string
  light?: boolean
}

// Split categories into N roughly equal columns
function splitIntoColumns(cats: MenuCategory[], getItems: (id: string) => MenuItem[], cols: number) {
  const weighted = cats.map(c => ({ cat: c, count: getItems(c.id).length + 2 }))
  const columns: typeof weighted[] = Array.from({ length: cols }, () => [])
  const colWeights = new Array(cols).fill(0)
  for (const item of weighted) {
    const minIdx = colWeights.indexOf(Math.min(...colWeights))
    columns[minIdx].push(item)
    colWeights[minIdx] += item.count
  }
  return columns
}

// Shared item row - no gradients, pure solid colors for html2canvas
function ItemRow({ item, nameColor, priceColor, descColor, dotColor }: { item: MenuItem, nameColor: string, priceColor: string, descColor: string, dotColor: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: nameColor, whiteSpace: 'nowrap' }}>{item.name}</span>
        <span style={{ flex: 1, borderBottom: `1px dotted ${dotColor}`, minWidth: 16 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: priceColor, whiteSpace: 'nowrap' }}>${item.price.toFixed(2)}</span>
      </div>
      {item.description && (
        <p style={{ fontSize: 11, color: descColor, marginTop: 2, lineHeight: 1.4, fontFamily: "'Inter', sans-serif" }}>{item.description}</p>
      )}
    </div>
  )
}

// ========== VERSION 1: Classic Elegant ==========
function V1Page({ cats, getItems, title, subtitle, light }: PageProps) {
  const columns = splitIntoColumns(cats, getItems, 3)
  const bg = light ? '#FAF8F3' : '#0C0C0C'
  const accent = light ? '#8B6914' : '#C8A84E'
  const textPrimary = light ? '#1a1a1a' : '#FFFFFF'
  const textSecondary = light ? '#666' : '#9CA3AF'
  const accentDim = light ? 'rgba(139,105,20,0.2)' : 'rgba(200,168,78,0.3)'
  const dotDim = light ? 'rgba(139,105,20,0.15)' : 'rgba(200,168,78,0.2)'

  return (
    <div style={{
      width: 1500, minHeight: 1100, padding: '50px 60px',
      background: bg, border: `2px solid ${accent}`,
      fontFamily: "'Playfair Display', Georgia, serif",
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: 14, left: 14, width: 36, height: 36, borderTop: `2px solid ${accent}`, borderLeft: `2px solid ${accent}` }} />
      <div style={{ position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderTop: `2px solid ${accent}`, borderRight: `2px solid ${accent}` }} />
      <div style={{ position: 'absolute', bottom: 14, left: 14, width: 36, height: 36, borderBottom: `2px solid ${accent}`, borderLeft: `2px solid ${accent}` }} />
      <div style={{ position: 'absolute', bottom: 14, right: 14, width: 36, height: 36, borderBottom: `2px solid ${accent}`, borderRight: `2px solid ${accent}` }} />

      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h1 style={{ fontSize: 42, color: accent, letterSpacing: 8, margin: 0, textTransform: 'uppercase' }}>Tacos Miranda</h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '10px 0' }}>
          <div style={{ width: 180, height: 1, background: accent }} />
          <div style={{ width: 8, height: 8, background: accent, transform: 'rotate(45deg)' }} />
          <div style={{ width: 180, height: 1, background: accent }} />
        </div>
        <h2 style={{ fontSize: 24, color: textPrimary, letterSpacing: 6, fontWeight: 400, margin: 0, textTransform: 'uppercase' }}>{title}</h2>
        <p style={{ fontSize: 12, color: textSecondary, marginTop: 6, fontStyle: 'italic', letterSpacing: 2, fontFamily: "'Inter', sans-serif" }}>{subtitle}</p>
      </div>

      <div style={{ display: 'flex', gap: 40 }}>
        {columns.map((col, ci) => (
          <div key={ci} style={{ flex: 1 }}>
            {col.map(({ cat }) => (
              <div key={cat.id} style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 16, color: accent, textTransform: 'uppercase', letterSpacing: 3, textAlign: 'center', marginBottom: 4 }}>{cat.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1, height: 1, background: accentDim }} />
                  <div style={{ width: 5, height: 5, background: accent, transform: 'rotate(45deg)', flexShrink: 0 }} />
                  <div style={{ flex: 1, height: 1, background: accentDim }} />
                </div>
                {getItems(cat.id).map(item => (
                  <ItemRow key={item.id} item={item} nameColor={textPrimary} priceColor={accent} descColor={textSecondary} dotColor={dotDim} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, paddingTop: 16, borderTop: `1px solid ${accentDim}` }}>
        <p style={{ fontSize: 11, color: textSecondary, letterSpacing: 2, fontFamily: "'Inter', sans-serif" }}>21582 Brookhurst St, Huntington Beach, CA 92646 | (657) 845-4011</p>
      </div>
    </div>
  )
}

// ========== VERSION 2: Modern Minimal ==========
function V2Page({ cats, getItems, title, subtitle, light }: PageProps) {
  const columns = splitIntoColumns(cats, getItems, 3)
  const bg = light ? '#FAF8F3' : '#0C0C0C'
  const textPrimary = light ? '#111' : '#FFFFFF'
  const textSecondary = light ? '#888' : '#9CA3AF'
  const accent = light ? '#8B6914' : '#C8A84E'
  const line = light ? '#E5E5E5' : '#333'
  const dotColor = light ? '#D4CFC3' : '#333'

  return (
    <div style={{
      width: 1500, minHeight: 1100, padding: '50px 70px',
      background: bg,
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h1 style={{ fontSize: 14, color: textSecondary, letterSpacing: 8, margin: '0 0 6px', textTransform: 'uppercase', fontWeight: 400 }}>Tacos Miranda</h1>
        <h2 style={{ fontSize: 40, color: textPrimary, letterSpacing: 2, fontWeight: 700, margin: '0 0 6px', fontFamily: "'Playfair Display', Georgia, serif" }}>{title}</h2>
        <div style={{ width: 50, height: 3, background: accent, margin: '10px auto' }} />
        <p style={{ fontSize: 12, color: textSecondary, letterSpacing: 3, textTransform: 'uppercase' }}>{subtitle}</p>
      </div>

      <div style={{ display: 'flex', gap: 50 }}>
        {columns.map((col, ci) => (
          <div key={ci} style={{ flex: 1 }}>
            {col.map(({ cat }) => (
              <div key={cat.id} style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ flex: 1, height: 1, background: line }} />
                  <h3 style={{ fontSize: 11, color: accent, textTransform: 'uppercase', letterSpacing: 4, fontWeight: 600, whiteSpace: 'nowrap', margin: 0 }}>{cat.name}</h3>
                  <div style={{ flex: 1, height: 1, background: line }} />
                </div>
                {getItems(cat.id).map(item => (
                  <ItemRow key={item.id} item={item} nameColor={textPrimary} priceColor={accent} descColor={textSecondary} dotColor={dotColor} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, paddingTop: 16, borderTop: `1px solid ${line}` }}>
        <p style={{ fontSize: 10, color: textSecondary, letterSpacing: 3, textTransform: 'uppercase' }}>21582 Brookhurst St, Huntington Beach, CA 92646 | (657) 845-4011</p>
      </div>
    </div>
  )
}

// ========== VERSION 3: Warm Rustic ==========
function V3Page({ cats, getItems, title, subtitle, light }: PageProps) {
  const columns = splitIntoColumns(cats, getItems, 3)
  const bg = light ? '#FDF6EC' : '#1A0E08'
  const accent = light ? '#8B2500' : '#C8A84E'
  const accentSecondary = light ? '#8B6914' : '#C8A84E'
  const textPrimary = light ? '#3D2B1F' : '#F5E6D0'
  const textSecondary = light ? '#7A6B5D' : '#9CA3AF'
  const borderColor = light ? '#8B2500' : '#C8A84E'
  const innerBorder = light ? 'rgba(139,37,0,0.15)' : 'rgba(200,168,78,0.15)'
  const dotColor = light ? 'rgba(139,37,0,0.15)' : 'rgba(200,168,78,0.15)'

  return (
    <div style={{
      width: 1500, minHeight: 1100, padding: '50px 60px',
      background: bg,
      fontFamily: "'Playfair Display', Georgia, serif",
      border: `3px double ${borderColor}`,
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', inset: 10, border: `1px solid ${innerBorder}`, pointerEvents: 'none' }} />

      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <p style={{ fontSize: 11, color: accentSecondary, letterSpacing: 6, textTransform: 'uppercase', margin: '0 0 4px', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>Est. Huntington Beach, CA</p>
        <h1 style={{ fontSize: 42, color: accent, letterSpacing: 4, margin: '0 0 6px' }}>Tacos Miranda</h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '8px 0' }}>
          <div style={{ width: 160, height: 1, background: accent }} />
          <span style={{ fontSize: 16, color: accent }}>&#9830;</span>
          <div style={{ width: 160, height: 1, background: accent }} />
        </div>
        <h2 style={{ fontSize: 26, color: textPrimary, letterSpacing: 6, fontWeight: 400, textTransform: 'uppercase', margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 12, color: accentSecondary, marginTop: 6, fontStyle: 'italic', letterSpacing: 2, fontFamily: "'Inter', sans-serif" }}>{subtitle}</p>
      </div>

      <div style={{ display: 'flex', gap: 40 }}>
        {columns.map((col, ci) => (
          <div key={ci} style={{ flex: 1 }}>
            {col.map(({ cat }) => (
              <div key={cat.id} style={{ marginBottom: 28 }}>
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, color: accent, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 4 }}>{cat.name}</h3>
                  <div style={{ width: 36, height: 2, background: accentSecondary, margin: '0 auto' }} />
                </div>
                {getItems(cat.id).map(item => (
                  <ItemRow key={item.id} item={item} nameColor={textPrimary} priceColor={accent} descColor={textSecondary} dotColor={dotColor} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ width: 260, height: 1, background: innerBorder }} />
          <span style={{ fontSize: 14, color: accent }}>&#9830;</span>
          <div style={{ width: 260, height: 1, background: innerBorder }} />
        </div>
        <p style={{ fontSize: 11, color: textSecondary, letterSpacing: 2, fontFamily: "'Inter', sans-serif" }}>21582 Brookhurst St, Huntington Beach, CA 92646 | (657) 845-4011</p>
      </div>
    </div>
  )
}
