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

      <DesignSection title="Classic Elegant" subtitle="Cream for breakfast, dark + gold for lunch/dinner">
        <MenuPage id="v1-breakfast" onDownload={() => handleDownload('v1-breakfast', 'TacosMiranda_Breakfast.png')} downloading={downloading} label="Breakfast">
          <V1Page cats={breakfastCats} getItems={getItems} title="Breakfast" subtitle="Served Daily Until 12pm" light />
        </MenuPage>
        <MenuPage id="v1-lunch" onDownload={() => handleDownload('v1-lunch', 'TacosMiranda_LunchDinner.png')} downloading={downloading} label="Lunch & Dinner">
          <V1Page cats={lunchCats} getItems={getItems} title="Lunch & Dinner" subtitle="Served All Day" />
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
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 19, fontWeight: 600, color: nameColor, whiteSpace: 'nowrap' }}>{item.name}</span>
        <span style={{ flex: 1, borderBottom: `1px dotted ${dotColor}`, minWidth: 16 }} />
        <span style={{ fontSize: 19, fontWeight: 700, color: priceColor, whiteSpace: 'nowrap' }}>${item.price.toFixed(2)}</span>
      </div>
      {item.description && (
        <p style={{ fontSize: 14, color: descColor, marginTop: 3, lineHeight: 1.5, fontFamily: "'Inter', sans-serif" }}>{item.description}</p>
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

      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 56, color: accent, letterSpacing: 10, margin: 0, textTransform: 'uppercase' }}>Tacos Miranda</h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '14px 0' }}>
          <div style={{ width: 200, height: 1, background: accent }} />
          <div style={{ width: 10, height: 10, background: accent, transform: 'rotate(45deg)' }} />
          <div style={{ width: 200, height: 1, background: accent }} />
        </div>
        <h2 style={{ fontSize: 32, color: textPrimary, letterSpacing: 8, fontWeight: 400, margin: 0, textTransform: 'uppercase' }}>{title}</h2>
        <p style={{ fontSize: 16, color: textSecondary, marginTop: 8, fontStyle: 'italic', letterSpacing: 3, fontFamily: "'Inter', sans-serif" }}>{subtitle}</p>
      </div>

      <div style={{ display: 'flex', gap: 40 }}>
        {columns.map((col, ci) => (
          <div key={ci} style={{ flex: 1 }}>
            {col.map(({ cat }) => (
              <div key={cat.id} style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 22, color: accent, textTransform: 'uppercase', letterSpacing: 4, textAlign: 'center', marginBottom: 6 }}>{cat.name}</h3>
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

      <div style={{ textAlign: 'center', marginTop: 30, paddingTop: 20, borderTop: `1px solid ${accentDim}` }}>
        <p style={{ fontSize: 14, color: textSecondary, letterSpacing: 3, fontFamily: "'Inter', sans-serif" }}>21582 Brookhurst St, Huntington Beach, CA 92646 | (657) 845-4011</p>
      </div>
    </div>
  )
}

