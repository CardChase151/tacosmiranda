import { useState, useEffect, useCallback } from 'react'
import { FileImage, FileText, Film, ArrowLeft } from 'lucide-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { MenuCategory, MenuItem } from '../types'

export default function PrintMenu() {
  const { isAdmin } = useAuth()
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

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

  // Helper: capture element at full size
  const captureElement = async (id: string) => {
    const el = document.getElementById(id)
    if (!el) return null
    const wrapper = el.parentElement
    const origTransform = wrapper?.style.transform || ''
    const origMargin = wrapper?.style.marginBottom || ''
    if (wrapper) { wrapper.style.transform = 'none'; wrapper.style.marginBottom = '0' }
    await new Promise(r => setTimeout(r, 150))
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: null, useCORS: true, logging: false })
    if (wrapper) { wrapper.style.transform = origTransform; wrapper.style.marginBottom = origMargin }
    return canvas
  }

  // Download PDF (both pages in one file)
  const handlePDF = async () => {
    setStatus('Generating PDF...')
    try {
      const c1 = await captureElement('menu-breakfast')
      const c2 = await captureElement('menu-lunch')
      if (!c1 || !c2) return

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [c1.width / 2, c1.height / 2] })
      pdf.addImage(c1.toDataURL('image/png'), 'PNG', 0, 0, c1.width / 2, c1.height / 2)
      pdf.addPage([c2.width / 2, c2.height / 2], 'landscape')
      pdf.addImage(c2.toDataURL('image/png'), 'PNG', 0, 0, c2.width / 2, c2.height / 2)
      pdf.save('TacosMiranda_Menu.pdf')
    } catch (e) { console.error(e) }
    setStatus('')
  }

  // Download Images (2 separate PNGs)
  const handleImages = async () => {
    setStatus('Generating images...')
    try {
      const c1 = await captureElement('menu-breakfast')
      const c2 = await captureElement('menu-lunch')
      if (c1) {
        const link = document.createElement('a')
        link.download = 'TacosMiranda_Breakfast.png'
        link.href = c1.toDataURL('image/png')
        link.click()
      }
      await new Promise(r => setTimeout(r, 500))
      if (c2) {
        const link = document.createElement('a')
        link.download = 'TacosMiranda_LunchDinner.png'
        link.href = c2.toDataURL('image/png')
        link.click()
      }
    } catch (e) { console.error(e) }
    setStatus('')
  }

  // Download Video as MP4 using VideoEncoder + mp4-muxer
  const createVideo = async (sourceCanvas: HTMLCanvasElement, filename: string, durationSec: number = 8) => {
    // Scale down to fit within 1920x1080 for TV compatibility and encoder limits
    const maxW = 1920
    const maxH = 1080
    const scale = Math.min(maxW / sourceCanvas.width, maxH / sourceCanvas.height, 1)
    const width = Math.floor(sourceCanvas.width * scale / 2) * 2  // must be even
    const height = Math.floor(sourceCanvas.height * scale / 2) * 2

    const scaledCanvas = document.createElement('canvas')
    scaledCanvas.width = width
    scaledCanvas.height = height
    const ctx = scaledCanvas.getContext('2d')!
    ctx.drawImage(sourceCanvas, 0, 0, width, height)
    const videoSource = scaledCanvas
    const fps = 30
    const totalFrames = durationSec * fps

    const target = new ArrayBufferTarget()
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width, height },
      fastStart: 'in-memory',
    })

    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error('Encoder error:', e),
    })

    encoder.configure({
      codec: 'avc1.640032',
      width,
      height,
      bitrate: 5_000_000,
      framerate: fps,
    })

    for (let i = 0; i < totalFrames; i++) {
      const frame = new VideoFrame(videoSource, {
        timestamp: i * (1_000_000 / fps),
        duration: 1_000_000 / fps,
      })
      encoder.encode(frame, { keyFrame: i % 30 === 0 })
      frame.close()
    }

    await encoder.flush()
    encoder.close()
    muxer.finalize()

    const blob = new Blob([target.buffer], { type: 'video/mp4' })
    const link = document.createElement('a')
    link.download = filename
    link.href = URL.createObjectURL(blob)
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const handleVideos = async () => {
    setStatus('Generating breakfast video...')
    try {
      const c1 = await captureElement('menu-breakfast')
      if (c1) await createVideo(c1, 'TacosMiranda_Breakfast.mp4', 8)

      setStatus('Generating lunch/dinner video...')
      const c2 = await captureElement('menu-lunch')
      if (c2) await createVideo(c2, 'TacosMiranda_LunchDinner.mp4', 8)
    } catch (e) { console.error(e) }
    setStatus('')
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

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '14px 28px', borderRadius: 10, border: 'none',
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  }

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', padding: '32px 24px 100px' }}>
      {/* Top bar */}
      <div style={{ maxWidth: 1200, margin: '0 auto 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gold)', textDecoration: 'none', fontSize: 14 }}>
          <ArrowLeft size={16} /> Back to Site
        </a>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--white)', letterSpacing: 2 }}>
          Menu Export
        </h1>
        <div style={{ width: 100 }} />
      </div>

      {/* Download Buttons */}
      <div style={{ maxWidth: 1200, margin: '0 auto 48px', display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={handlePDF} disabled={!!status} style={{ ...btnStyle, background: 'var(--gold)', color: 'var(--black)', opacity: status ? 0.5 : 1 }}>
          <FileText size={18} /> Download PDF
        </button>
        <button onClick={handleImages} disabled={!!status} style={{ ...btnStyle, background: '#FFFFFF', color: '#111', opacity: status ? 0.5 : 1 }}>
          <FileImage size={18} /> Download Images
        </button>
        <button onClick={handleVideos} disabled={!!status} style={{ ...btnStyle, background: '#333', color: '#FFF', opacity: status ? 0.5 : 1 }}>
          <Film size={18} /> Download Videos (for TV)
        </button>
      </div>

      {status && (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ color: 'var(--gold)', fontSize: 14, fontStyle: 'italic' }}>{status}</p>
        </div>
      )}

      {/* Previews */}
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Breakfast Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <p style={{ color: 'var(--gray)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Breakfast</p>
            <div style={{ transform: 'scale(0.35)', transformOrigin: 'top center', marginBottom: -715 }}>
              <div id="menu-breakfast">
                <V1Page cats={breakfastCats} getItems={getItems} title="Breakfast" subtitle="Served Daily Until 12pm" light />
              </div>
            </div>
          </div>

          {/* Lunch & Dinner Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <p style={{ color: 'var(--gray)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Lunch & Dinner</p>
            <div style={{ transform: 'scale(0.35)', transformOrigin: 'top center', marginBottom: -715 }}>
              <div id="menu-lunch">
                <V1Page cats={lunchCats} getItems={getItems} title="Lunch & Dinner" subtitle="Served All Day" />
              </div>
            </div>
          </div>
        </div>
      </div>
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
