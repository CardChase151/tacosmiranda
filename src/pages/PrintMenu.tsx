import { useState, useEffect, useCallback, useRef } from 'react'
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
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: null, useCORS: true })
    const link = document.createElement('a')
    link.download = filename
    link.href = canvas.toDataURL('image/png')
    link.click()
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
      {/* Top bar */}
      <div style={{ maxWidth: 1200, margin: '0 auto 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gold)', textDecoration: 'none', fontSize: 14 }}>
          <ArrowLeft size={16} /> Back to Site
        </a>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--white)', letterSpacing: 2 }}>
          Print Menu Designer
        </h1>
        <div style={{ width: 100 }} />
      </div>

      {/* Version 1: Classic Elegant - Dark with gold borders */}
      <DesignSection title="Version 1 - Classic Elegant" subtitle="Dark background, gold accents, formal layout">
        <MenuPage id="v1-breakfast" onDownload={() => handleDownload('v1-breakfast', 'TacosMiranda_Breakfast_V1.png')} downloading={downloading} label="Breakfast">
          <V1Page cats={breakfastCats} getItems={getItems} title="Breakfast" subtitle="Served Daily Until 12pm" />
        </MenuPage>
        <MenuPage id="v1-lunch" onDownload={() => handleDownload('v1-lunch', 'TacosMiranda_LunchDinner_V1.png')} downloading={downloading} label="Lunch & Dinner">
          <V1Page cats={lunchCats} getItems={getItems} title="Lunch & Dinner" subtitle="Served All Day" />
        </MenuPage>
      </DesignSection>

      {/* Version 2: Modern Minimal - Clean white */}
      <DesignSection title="Version 2 - Modern Minimal" subtitle="Clean white, sharp typography, modern feel">
        <MenuPage id="v2-breakfast" onDownload={() => handleDownload('v2-breakfast', 'TacosMiranda_Breakfast_V2.png')} downloading={downloading} label="Breakfast">
          <V2Page cats={breakfastCats} getItems={getItems} title="Breakfast" subtitle="Served Daily Until 12pm" />
        </MenuPage>
        <MenuPage id="v2-lunch" onDownload={() => handleDownload('v2-lunch', 'TacosMiranda_LunchDinner_V2.png')} downloading={downloading} label="Lunch & Dinner">
          <V2Page cats={lunchCats} getItems={getItems} title="Lunch & Dinner" subtitle="Served All Day" />
        </MenuPage>
      </DesignSection>

      {/* Version 3: Warm Rustic - Textured warm tones */}
      <DesignSection title="Version 3 - Warm Rustic" subtitle="Warm tones, textured feel, traditional Mexican vibe">
        <MenuPage id="v3-breakfast" onDownload={() => handleDownload('v3-breakfast', 'TacosMiranda_Breakfast_V3.png')} downloading={downloading} label="Breakfast">
          <V3Page cats={breakfastCats} getItems={getItems} title="Breakfast" subtitle="Served Daily Until 12pm" />
        </MenuPage>
        <MenuPage id="v3-lunch" onDownload={() => handleDownload('v3-lunch', 'TacosMiranda_LunchDinner_V3.png')} downloading={downloading} label="Lunch & Dinner">
          <V3Page cats={lunchCats} getItems={getItems} title="Lunch & Dinner" subtitle="Served All Day" />
        </MenuPage>
      </DesignSection>
    </div>
  )
}

// Layout wrapper for each design section
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

// Wrapper for each downloadable page
function MenuPage({ id, onDownload, downloading, label, children }: { id: string, onDownload: () => void, downloading: string, label: string, children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <p style={{ color: 'var(--gray)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</p>
      <div style={{ transform: 'scale(0.35)', transformOrigin: 'top center', marginBottom: -500 }}>
        <div id={id}>
          {children}
        </div>
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

// Shared types
interface PageProps {
  cats: MenuCategory[]
  getItems: (catId: string) => MenuItem[]
  title: string
  subtitle: string
}

// ========== VERSION 1: Classic Elegant (Dark + Gold) ==========
function V1Page({ cats, getItems, title, subtitle }: PageProps) {
  return (
    <div style={{
      width: 1500, minHeight: 1100, padding: '60px 70px',
      background: '#0C0C0C',
      border: '2px solid #C8A84E',
      fontFamily: "'Playfair Display', Georgia, serif",
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Corner ornaments */}
      <div style={{ position: 'absolute', top: 16, left: 16, width: 40, height: 40, borderTop: '2px solid #C8A84E', borderLeft: '2px solid #C8A84E' }} />
      <div style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderTop: '2px solid #C8A84E', borderRight: '2px solid #C8A84E' }} />
      <div style={{ position: 'absolute', bottom: 16, left: 16, width: 40, height: 40, borderBottom: '2px solid #C8A84E', borderLeft: '2px solid #C8A84E' }} />
      <div style={{ position: 'absolute', bottom: 16, right: 16, width: 40, height: 40, borderBottom: '2px solid #C8A84E', borderRight: '2px solid #C8A84E' }} />

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 50 }}>
        <h1 style={{ fontSize: 52, color: '#C8A84E', letterSpacing: 8, margin: 0, textTransform: 'uppercase' }}>Tacos Miranda</h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, margin: '16px 0' }}>
          <div style={{ flex: 1, maxWidth: 200, height: 1, background: 'linear-gradient(to right, transparent, #C8A84E)' }} />
          <div style={{ width: 10, height: 10, background: '#C8A84E', transform: 'rotate(45deg)' }} />
          <div style={{ flex: 1, maxWidth: 200, height: 1, background: 'linear-gradient(to left, transparent, #C8A84E)' }} />
        </div>
        <h2 style={{ fontSize: 28, color: '#FFFFFF', letterSpacing: 6, fontWeight: 400, margin: 0, textTransform: 'uppercase' }}>{title}</h2>
        <p style={{ fontSize: 14, color: '#9CA3AF', marginTop: 8, fontStyle: 'italic', letterSpacing: 2 }}>{subtitle}</p>
      </div>

      {/* Menu in 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: cats.length > 3 ? '1fr 1fr' : '1fr', gap: '40px 60px' }}>
        {cats.map(cat => (
          <div key={cat.id}>
            <h3 style={{ fontSize: 22, color: '#C8A84E', textTransform: 'uppercase', letterSpacing: 4, textAlign: 'center', marginBottom: 4 }}>{cat.name}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(200,168,78,0.3))' }} />
              <div style={{ width: 6, height: 6, background: '#C8A84E', transform: 'rotate(45deg)', flexShrink: 0 }} />
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, rgba(200,168,78,0.3))' }} />
            </div>
            {getItems(cat.id).map(item => (
              <div key={item.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#FFFFFF' }}>{item.name}</span>
                  <span style={{ flex: 1, borderBottom: '1px dotted rgba(200,168,78,0.2)', minWidth: 20 }} />
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#C8A84E' }}>${item.price.toFixed(2)}</span>
                </div>
                {item.description && (
                  <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3, lineHeight: 1.4, fontFamily: "'Inter', sans-serif" }}>{item.description}</p>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', marginTop: 50, paddingTop: 20, borderTop: '1px solid rgba(200,168,78,0.2)' }}>
        <p style={{ fontSize: 12, color: '#9CA3AF', letterSpacing: 2, fontFamily: "'Inter', sans-serif" }}>21582 Brookhurst St, Huntington Beach, CA 92646</p>
        <p style={{ fontSize: 12, color: '#C8A84E', letterSpacing: 2, marginTop: 4, fontFamily: "'Inter', sans-serif" }}>(657) 845-4011</p>
      </div>
    </div>
  )
}

// ========== VERSION 2: Modern Minimal (White + Black) ==========
function V2Page({ cats, getItems, title, subtitle }: PageProps) {
  return (
    <div style={{
      width: 1500, minHeight: 1100, padding: '70px 80px',
      background: '#FFFFFF',
      fontFamily: "'Inter', -apple-system, sans-serif",
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 50 }}>
        <h1 style={{ fontSize: 18, color: '#999', letterSpacing: 8, margin: '0 0 8px', textTransform: 'uppercase', fontWeight: 400 }}>Tacos Miranda</h1>
        <h2 style={{ fontSize: 48, color: '#111', letterSpacing: 2, fontWeight: 700, margin: '0 0 8px', fontFamily: "'Playfair Display', Georgia, serif" }}>{title}</h2>
        <div style={{ width: 60, height: 3, background: '#111', margin: '12px auto' }} />
        <p style={{ fontSize: 13, color: '#999', letterSpacing: 3, textTransform: 'uppercase' }}>{subtitle}</p>
      </div>

      {/* Menu in 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: cats.length > 3 ? '1fr 1fr' : '1fr', gap: '44px 70px' }}>
        {cats.map(cat => (
          <div key={cat.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ flex: 1, height: 1, background: '#E5E5E5' }} />
              <h3 style={{ fontSize: 13, color: '#111', textTransform: 'uppercase', letterSpacing: 4, fontWeight: 600, whiteSpace: 'nowrap' }}>{cat.name}</h3>
              <div style={{ flex: 1, height: 1, background: '#E5E5E5' }} />
            </div>
            {getItems(cat.id).map(item => (
              <div key={item.id} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#111' }}>{item.name}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>${item.price.toFixed(2)}</span>
                </div>
                {item.description && (
                  <p style={{ fontSize: 12, color: '#888', marginTop: 3, lineHeight: 1.5 }}>{item.description}</p>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', marginTop: 50, paddingTop: 24, borderTop: '1px solid #E5E5E5' }}>
        <p style={{ fontSize: 11, color: '#999', letterSpacing: 3, textTransform: 'uppercase' }}>21582 Brookhurst St, Huntington Beach, CA 92646</p>
        <p style={{ fontSize: 11, color: '#111', letterSpacing: 3, marginTop: 4, fontWeight: 600 }}>(657) 845-4011</p>
      </div>
    </div>
  )
}

// ========== VERSION 3: Warm Rustic (Cream + Deep Red/Brown) ==========
function V3Page({ cats, getItems, title, subtitle }: PageProps) {
  return (
    <div style={{
      width: 1500, minHeight: 1100, padding: '60px 70px',
      background: '#FDF6EC',
      fontFamily: "'Playfair Display', Georgia, serif",
      position: 'relative',
      border: '3px double #8B2500',
    }}>
      {/* Inner border */}
      <div style={{
        position: 'absolute', inset: 12,
        border: '1px solid rgba(139,37,0,0.2)',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 50 }}>
        <p style={{ fontSize: 13, color: '#8B6914', letterSpacing: 6, textTransform: 'uppercase', margin: '0 0 4px', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>Est. Huntington Beach, CA</p>
        <h1 style={{ fontSize: 52, color: '#8B2500', letterSpacing: 4, margin: '0 0 8px' }}>Tacos Miranda</h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '12px 0' }}>
          <div style={{ flex: 1, maxWidth: 180, height: 1, background: 'linear-gradient(to right, transparent, #8B2500)' }} />
          <span style={{ fontSize: 20, color: '#8B2500' }}>&#9830;</span>
          <div style={{ flex: 1, maxWidth: 180, height: 1, background: 'linear-gradient(to left, transparent, #8B2500)' }} />
        </div>
        <h2 style={{ fontSize: 30, color: '#3D2B1F', letterSpacing: 6, fontWeight: 400, textTransform: 'uppercase' }}>{title}</h2>
        <p style={{ fontSize: 13, color: '#8B6914', marginTop: 8, fontStyle: 'italic', letterSpacing: 2, fontFamily: "'Inter', sans-serif" }}>{subtitle}</p>
      </div>

      {/* Menu in 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: cats.length > 3 ? '1fr 1fr' : '1fr', gap: '40px 60px' }}>
        {cats.map(cat => (
          <div key={cat.id}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 20, color: '#8B2500', textTransform: 'uppercase', letterSpacing: 4, marginBottom: 6 }}>{cat.name}</h3>
              <div style={{ width: 40, height: 2, background: '#8B6914', margin: '0 auto' }} />
            </div>
            {getItems(cat.id).map(item => (
              <div key={item.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#3D2B1F' }}>{item.name}</span>
                  <span style={{ flex: 1, borderBottom: '1px dotted rgba(139,37,0,0.2)', minWidth: 20 }} />
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#8B2500' }}>${item.price.toFixed(2)}</span>
                </div>
                {item.description && (
                  <p style={{ fontSize: 12, color: '#7A6B5D', marginTop: 3, lineHeight: 1.4, fontFamily: "'Inter', sans-serif" }}>{item.description}</p>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', marginTop: 50, paddingTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1, maxWidth: 300, height: 1, background: 'linear-gradient(to right, transparent, rgba(139,37,0,0.3))' }} />
          <span style={{ fontSize: 16, color: '#8B2500' }}>&#9830;</span>
          <div style={{ flex: 1, maxWidth: 300, height: 1, background: 'linear-gradient(to left, transparent, rgba(139,37,0,0.3))' }} />
        </div>
        <p style={{ fontSize: 12, color: '#7A6B5D', letterSpacing: 2, fontFamily: "'Inter', sans-serif" }}>21582 Brookhurst St, Huntington Beach, CA 92646</p>
        <p style={{ fontSize: 12, color: '#8B2500', letterSpacing: 2, marginTop: 4, fontFamily: "'Inter', sans-serif" }}>(657) 845-4011</p>
      </div>
    </div>
  )
}
