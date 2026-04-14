import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { supabase } from '../config/supabase'
import { MenuCategory, MenuItem } from '../types'
import { Plus, Minus, RotateCcw } from 'lucide-react'

// In-store TV menu. Default = split-screen Breakfast + Lunch.
// Tap a side -> that meal expands fullscreen. Tap again -> split.
// Designed at 1920x1080; scales to fit any viewport. Manual zoom persists per device.

const DESIGN_W = 1920
const DESIGN_H = 1080
const ZOOM_KEY = 'screen-zoom'

type Mode = 'both' | 'breakfast' | 'lunch_dinner'

export default function Screen() {
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>('both')
  const [zoom, setZoom] = useState(1)
  const [autoScale, setAutoScale] = useState(1)
  const [showControls, setShowControls] = useState(false)
  const hideTimer = useRef<number | null>(null)

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

  // Restore zoom + listen for resize for auto-fit.
  useEffect(() => {
    const saved = localStorage.getItem(ZOOM_KEY)
    if (saved) setZoom(parseFloat(saved))
    const recalc = () => {
      const sw = window.innerWidth / DESIGN_W
      const sh = window.innerHeight / DESIGN_H
      setAutoScale(Math.min(sw, sh))
    }
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [])

  // Show controls on any mouse move; hide after 3s of no activity.
  useEffect(() => {
    const onMove = () => {
      setShowControls(true)
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
      hideTimer.current = window.setTimeout(() => setShowControls(false), 3000)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchstart', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchstart', onMove)
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [])

  const setZoomPersist = (z: number) => {
    const clamped = Math.max(0.5, Math.min(2, z))
    setZoom(clamped)
    localStorage.setItem(ZOOM_KEY, String(clamped))
  }

  const breakfastCats = categories.filter(c => c.meal_type === 'breakfast')
  const lunchCats = categories.filter(c => c.meal_type === 'lunch_dinner')
  const getItems = (catId: string) => items.filter(i => i.category_id === catId).sort((a, b) => a.sort_order - b.sort_order)

  if (loading) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0C0C0C', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 28, fontWeight: 500 }}>
        Loading menu...
      </div>
    )
  }

  const finalScale = autoScale * zoom

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0C0C0C', overflow: 'hidden', position: 'relative', cursor: 'pointer' }}>
      {/* Scaled design canvas */}
      <div style={{
        position: 'absolute',
        left: '50%', top: '50%',
        width: DESIGN_W, height: DESIGN_H,
        transform: `translate(-50%, -50%) scale(${finalScale})`,
        transformOrigin: 'center center',
      }}>
        {mode === 'both' && (
          <div style={{ width: '100%', height: '100%', display: 'flex' }}>
            <Panel
              title="Breakfast"
              subtitle="Served All Day"
              cats={breakfastCats}
              getItems={getItems}
              light
              onClick={() => setMode('breakfast')}
              half
            />
            <Panel
              title="Lunch & Dinner"
              subtitle="Served Starting at 10am"
              cats={lunchCats}
              getItems={getItems}
              onClick={() => setMode('lunch_dinner')}
              half
            />
          </div>
        )}
        {mode === 'breakfast' && (
          <Panel
            title="Breakfast"
            subtitle="Served All Day"
            cats={breakfastCats}
            getItems={getItems}
            light
            onClick={() => setMode('both')}
          />
        )}
        {mode === 'lunch_dinner' && (
          <Panel
            title="Lunch & Dinner"
            subtitle="Served Starting at 10am"
            cats={lunchCats}
            getItems={getItems}
            onClick={() => setMode('both')}
          />
        )}
      </div>

      {/* Floating zoom controls */}
      <div style={{
        position: 'fixed', bottom: 20, right: 20,
        display: 'flex', gap: 8,
        opacity: showControls ? 1 : 0,
        transition: 'opacity 0.3s ease',
        pointerEvents: showControls ? 'auto' : 'none',
        zIndex: 100,
      }}>
        <ZoomBtn onClick={(e) => { e.stopPropagation(); setZoomPersist(zoom - 0.05) }}><Minus size={20} /></ZoomBtn>
        <ZoomBtn onClick={(e) => { e.stopPropagation(); setZoomPersist(1) }}><RotateCcw size={20} /></ZoomBtn>
        <ZoomBtn onClick={(e) => { e.stopPropagation(); setZoomPersist(zoom + 0.05) }}><Plus size={20} /></ZoomBtn>
        <div style={{
          background: 'rgba(0,0,0,0.7)', color: '#C8A84E', border: '1px solid #C8A84E',
          padding: '8px 14px', borderRadius: 8, fontSize: 13, fontFamily: "'Inter', sans-serif",
          display: 'flex', alignItems: 'center', minWidth: 60, justifyContent: 'center',
        }}>
          {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  )
}

function ZoomBtn({ onClick, children }: { onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'rgba(0,0,0,0.7)', color: '#C8A84E', border: '1px solid #C8A84E',
        width: 40, height: 40, borderRadius: 8, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
}

interface PanelProps {
  title: string
  subtitle: string
  cats: MenuCategory[]
  getItems: (catId: string) => MenuItem[]
  light?: boolean
  onClick: () => void
  half?: boolean
}

function Panel({ title, subtitle, cats, getItems, light, onClick, half }: PanelProps) {
  // High contrast text + gold accents (border, dividers, prices).
  const bg = light ? '#FFFFFF' : '#000000'
  const accent = light ? '#8B6914' : '#C8A84E'
  const textPrimary = light ? '#000000' : '#FFFFFF'
  const accentDim = light ? 'rgba(139,105,20,0.5)' : 'rgba(200,168,78,0.6)'
  const dotDim = light ? 'rgba(139,105,20,0.35)' : 'rgba(200,168,78,0.4)'

  // Pick column count based on total item density so menus always fit without
  // forcing the team to manually tune fonts when they add items.
  const totalItems = cats.reduce((sum, c) => sum + getItems(c.id).length, 0)
  const maxCols = half ? 3 : 4
  const minCols = half ? 2 : 2
  // Target ~8 items per column before we split further.
  const wantCols = Math.max(minCols, Math.min(maxCols, Math.ceil(totalItems / 8)))
  const cols = splitIntoColumns(cats, getItems, wantCols)

  // After render, measure the items-area. If natural content is taller than
  // the container, scale it down so nothing gets cut off. Re-runs on menu edits.
  const contentRef = useRef<HTMLDivElement>(null)
  const scalerRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(1)

  useLayoutEffect(() => {
    const measure = () => {
      const container = contentRef.current
      const inner = scalerRef.current
      if (!container || !inner) return
      // Reset to 1 before measuring natural size.
      inner.style.transform = 'scale(1)'
      inner.style.width = '100%'
      const available = container.clientHeight
      const natural = inner.scrollHeight
      if (natural <= available || available <= 0) {
        setFitScale(1)
        return
      }
      const s = Math.max(0.4, available / natural)
      setFitScale(s)
    }
    measure()
    window.addEventListener('resize', measure)
    // Fonts/images may shift layout — re-measure shortly after mount.
    const t = window.setTimeout(measure, 200)
    return () => { window.removeEventListener('resize', measure); window.clearTimeout(t) }
  }, [cats, cols.length, half])

  return (
    <div
      onClick={onClick}
      style={{
        width: half ? '50%' : '100%',
        height: '100%',
        padding: half ? '28px 28px' : '36px 44px',
        background: bg,
        border: `3px solid ${accent}`,
        boxSizing: 'border-box',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        position: 'relative',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Gold corner accents */}
      <div style={{ position: 'absolute', top: 10, left: 10, width: 22, height: 22, borderTop: `3px solid ${accent}`, borderLeft: `3px solid ${accent}` }} />
      <div style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderTop: `3px solid ${accent}`, borderRight: `3px solid ${accent}` }} />
      <div style={{ position: 'absolute', bottom: 10, left: 10, width: 22, height: 22, borderBottom: `3px solid ${accent}`, borderLeft: `3px solid ${accent}` }} />
      <div style={{ position: 'absolute', bottom: 10, right: 10, width: 22, height: 22, borderBottom: `3px solid ${accent}`, borderRight: `3px solid ${accent}` }} />

      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: half ? 30 : 46, color: textPrimary, margin: 0, fontWeight: 900 }}>Tacos Miranda</h1>
        <h2 style={{ fontSize: half ? 20 : 30, color: accent, fontWeight: 800, margin: '4px 0 0' }}>{title}</h2>
        <p style={{ fontSize: half ? 12 : 16, color: textPrimary, marginTop: 2, fontWeight: 600, opacity: 0.85 }}>{subtitle}</p>
      </div>

      <div ref={contentRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div
          ref={scalerRef}
          style={{
            transform: `scale(${fitScale})`,
            transformOrigin: 'top center',
            width: fitScale < 1 ? `${100 / fitScale}%` : '100%',
            height: 'auto',
          }}
        >
          <div style={{ display: 'flex', gap: half ? 14 : 28 }}>
            {cols.map((col, ci) => (
              <div key={ci} style={{ flex: 1, minWidth: 0 }}>
                {col.map(({ cat }) => (
                  <div key={cat.id} style={{ marginBottom: 14 }}>
                    <h3 style={{ fontSize: half ? 16 : 22, color: accent, textAlign: 'center', marginBottom: 4, fontWeight: 900 }}>{cat.name}</h3>
                    <div style={{ borderBottom: `2px solid ${accentDim}`, marginBottom: 8 }} />
                    {getItems(cat.id).map(item => (
                      <ItemRow key={item.id} item={item} nameColor={textPrimary} priceColor={accent} descColor={textPrimary} dotColor={dotDim} half={half} />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${accentDim}` }}>
        <p style={{ fontSize: half ? 11 : 14, color: textPrimary, fontWeight: 600, margin: 0, opacity: 0.85 }}>21582 Brookhurst St, Huntington Beach, CA 92646 &nbsp;|&nbsp; (657) 845-4011</p>
      </div>
    </div>
  )
}

function ItemRow({ item, nameColor, priceColor, descColor, dotColor, half }: { item: MenuItem; nameColor: string; priceColor: string; descColor: string; dotColor: string; half?: boolean }) {
  return (
    <div style={{ marginBottom: half ? 6 : 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: half ? 14 : 20, color: nameColor, fontWeight: 700 }}>{item.name}</span>
        <div style={{ flex: 1, borderBottom: `1px dotted ${dotColor}`, marginBottom: 4 }} />
        <span style={{ fontSize: half ? 15 : 22, color: priceColor, fontWeight: 900 }}>${Number(item.price).toFixed(2)}</span>
      </div>
      {item.description && (
        <p style={{ fontSize: half ? 11 : 14, color: descColor, marginTop: 1, lineHeight: 1.35, fontWeight: 500, opacity: 0.85 }}>{item.description}</p>
      )}
    </div>
  )
}

// Round-robin distribute categories across N columns by item count.
function splitIntoColumns(cats: MenuCategory[], getItems: (id: string) => MenuItem[], n: number) {
  const cols: { cat: MenuCategory }[][] = Array.from({ length: n }, () => [])
  const heights = new Array(n).fill(0)
  cats.forEach(cat => {
    const rows = 1 + getItems(cat.id).length
    let minIdx = 0
    for (let i = 1; i < n; i++) if (heights[i] < heights[minIdx]) minIdx = i
    cols[minIdx].push({ cat })
    heights[minIdx] += rows
  })
  return cols
}
