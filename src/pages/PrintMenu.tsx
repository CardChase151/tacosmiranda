import { useState, useEffect, useCallback, useLayoutEffect, useRef, useContext, createContext, useMemo } from 'react'
import { FileImage, FileText, Film, ArrowLeft, Eye, Smartphone } from 'lucide-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { MenuCategory, MenuItem } from '../types'

// Each format is a real paper size at 150 dpi, plus what the owner has to buy
// to print it. Type auto-fits whatever canvas it lands on, so a bigger sheet
// simply means bigger type rather than a different layout.
type FormatKey = 'screen' | 'folded' | 'poster'

interface MenuFormat {
  key: FormatKey
  label: string
  blurb: string
  width: number
  height: number
  cols: number
  // What to tell the owner to buy or ask the print shop for.
  paper: string
  approxType: string
  // Ceiling on the type scale. Per-format so a big sheet can grow without
  // changing the sizes already dialled in on the smaller ones.
  maxScale: number
  // Physical width of one captured sheet, used to hit a real print DPI.
  sheetWidthIn: number
}

const FORMATS: MenuFormat[] = [
  {
    key: 'screen',
    label: 'Wide Sheet',
    blurb: 'The 16:9 landscape layout. Drives the in-store TVs, and prints as a single wide page.',
    width: 1200, height: 675, cols: 3, maxScale: 2.2, sheetWidthIn: 11,
    paper: 'For the TVs there is no paper — use the video or image export. To print it, use '
         + 'letter 8.5 x 11 in landscape, or tabloid 11 x 17 landscape if you want it larger.',
    approxType: 'one page per meal',
  },
  {
    key: 'folded',
    label: 'Folded Menu',
    blurb: 'A four-panel booklet per meal: cover, then the menu across three pages.',
    width: 825, height: 1275, cols: 1, maxScale: 2.2, sheetWidthIn: 11,
    paper: 'One sheet of letter 8.5 x 11 per meal, fed LANDSCAPE, printed double-sided, then '
         + 'folded once down the middle. That gives four 5.5 x 8.5 panels. Plain 20 lb copy paper '
         + 'works; 32 lb or 65 lb cardstock feels like a real menu. Any office printer — no print shop.',
    approxType: 'cover + 3 pages per meal',
  },
]


export default function PrintMenu() {
  const { isAdmin } = useAuth()
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [formatKey, setFormatKey] = useState<FormatKey>('screen')
  // Sheets are 1200-1650px wide. Shrunk onto a phone they are unreadable, so
  // on mobile we keep them laid out off-screen for the export and hand the
  // owner a PDF instead of a postage-stamp preview.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 900 : false
  )
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Mounting the sheets costs a dozen synchronous layout passes each. On a
  // phone that blocks the first paint, so nothing renders until asked for.
  const [sheetsMounted, setSheetsMounted] = useState(!isMobile)
  const [pendingExport, setPendingExport] = useState<null | 'pdf' | 'images'>(null)
  useEffect(() => { if (!isMobile) setSheetsMounted(true) }, [isMobile])
  const format = FORMATS.find(f => f.key === formatKey) as MenuFormat

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
  // Capture at a real print resolution rather than an arbitrary multiplier.
  // 300 DPI is what a print shop wants; anything beyond it is invisible on
  // paper and only inflates the file. Phones get 150 to stay inside memory.
  const captureScaleFor = (el: HTMLElement) => {
    const dpi = isMobile ? 150 : 300
    const px = el.offsetWidth || format.width
    return Math.max(1, Math.min(4, (dpi * format.sheetWidthIn) / px))
  }

  const captureElement = async (id: string) => {
    const el = document.getElementById(id)
    if (!el) return null
    const wrapper = el.parentElement
    const origTransform = wrapper?.style.transform || ''
    const origMargin = wrapper?.style.marginBottom || ''
    if (wrapper) { wrapper.style.transform = 'none'; wrapper.style.marginBottom = '0' }
    await new Promise(r => setTimeout(r, 150))
    try {
      return await html2canvas(el, {
        scale: captureScaleFor(el),
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      })
    } catch (e) {
      console.error('capture failed', id, e)
      return null
    } finally {
      if (wrapper) { wrapper.style.transform = origTransform; wrapper.style.marginBottom = origMargin }
    }
  }

  // Download PDF (both pages in one file)
  const handlePDF = async () => {
    setStatus('Generating PDF...')
    try {
      const canvases: HTMLCanvasElement[] = []
      for (const t of exportTargets) {
        const c = await captureElement(t.id)
        if (c) canvases.push(c)
      }
      if (canvases.length === 0) return

      // Each captured sheet becomes its own page at its own aspect. For the
      // folded menu that is four landscape pages: outside, inside, per meal.
      const pageOf = (c: HTMLCanvasElement) =>
        [c.width / 2, c.height / 2] as [number, number]
      const orientOf = (c: HTMLCanvasElement) =>
        (c.width >= c.height ? 'landscape' : 'portrait') as 'landscape' | 'portrait'

      const pdf = new jsPDF({ orientation: orientOf(canvases[0]), unit: 'px', format: pageOf(canvases[0]) })
      canvases.forEach((c, i) => {
        if (i > 0) pdf.addPage(pageOf(c), orientOf(c))
        pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, c.width / 2, c.height / 2)
      })
      pdf.save(`TacosMiranda_Menu_${format.key}.pdf`)
    } catch (e) { console.error(e) } finally { setStatus('') }
  }

  // Download Images (2 separate PNGs)
  const buildPDF = async () => {
    const canvases: HTMLCanvasElement[] = []
    for (const t of exportTargets) {
      const c = await captureElement(t.id)
      if (c) canvases.push(c)
    }
    if (canvases.length === 0) return null

    const pageOf = (c: HTMLCanvasElement) => [c.width / 2, c.height / 2] as [number, number]
    const orientOf = (c: HTMLCanvasElement) =>
      (c.width >= c.height ? 'landscape' : 'portrait') as 'landscape' | 'portrait'

    const pdf = new jsPDF({ orientation: orientOf(canvases[0]), unit: 'px', format: pageOf(canvases[0]) })
    canvases.forEach((c, i) => {
      if (i > 0) pdf.addPage(pageOf(c), orientOf(c))
      pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, c.width / 2, c.height / 2)
    })
    return pdf
  }

  const runOpenPDF = async () => {
    setStatus('Building preview...')
    try {
      const pdf = await buildPDF()
      if (!pdf) {
        alert('Could not build the preview. Try again, or open this page on a computer.')
      } else {
        // Popup blockers can swallow the new tab; fall back to a download.
        const opened = window.open(pdf.output('bloburl') as unknown as string, '_blank')
        if (!opened) pdf.save(`TacosMiranda_Menu_${format.key}.pdf`)
      }
    } catch (e) {
      console.error(e)
      alert('Could not build the preview. Try again, or open this page on a computer.')
    } finally {
      setStatus('')
    }
  }

  const handleOpenPDF = () => {
    if (!sheetsMounted) {
      setStatus('Building preview...')
      setPendingExport('pdf')
      setSheetsMounted(true)
      return
    }
    runOpenPDF()
  }

  // Once the sheets are up, give React a frame to commit and the type-fitting
  // effects a beat to settle before capturing.
  useEffect(() => {
    if (!sheetsMounted || !pendingExport) return
    const t = window.setTimeout(() => {
      setPendingExport(null)
      if (pendingExport === 'pdf') runOpenPDF()
      else handleImages()
    }, 700)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetsMounted, pendingExport])

  const handleImages = async () => {
    if (!sheetsMounted) {
      setStatus('Generating images...')
      setPendingExport('images')
      setSheetsMounted(true)
      return
    }
    setStatus('Generating images...')
    try {
      for (const t of exportTargets) {
        const c = await captureElement(t.id)
        if (!c) continue
        const link = document.createElement('a')
        link.download = `TacosMiranda_${t.name}_${format.key}.png`
        link.href = c.toDataURL('image/png')
        link.click()
        await new Promise(r => setTimeout(r, 400))
      }
    } catch (e) { console.error(e) } finally { setStatus('') }
  }

  // Download Video as MP4 using VideoEncoder + mp4-muxer
  const createVideo = async (sourceCanvas: HTMLCanvasElement, filename: string, durationSec: number = 8) => {
    const maxW = 3840
    const maxH = 2160
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

  // Shrink each sheet to a sane on-screen size and claw back the empty space
  // the CSS transform leaves behind.
  // What the export captures, in the order it should print.
  const exportTargets = formatKey === 'folded'
    ? [
        { id: 'fold-bf-outside', name: 'Breakfast_Outside' },
        { id: 'fold-bf-inside', name: 'Breakfast_Inside' },
        { id: 'fold-ln-outside', name: 'LunchDinner_Outside' },
        { id: 'fold-ln-inside', name: 'LunchDinner_Inside' },
      ]
    : [
        { id: 'menu-breakfast', name: 'Breakfast' },
        { id: 'menu-lunch', name: 'LunchDinner' },
      ]

  // Show the sheets close to full size. Shrinking a 1200px sheet into a 520px
  // box made readable type look microscopic on screen.
  const previewScale = Math.min(1040 / format.width, 780 / format.height)
  const foldScale = Math.min(1040 / (PANEL_W * 2), 700 / PANEL_H)
  const foldGap = -Math.round(PANEL_H * (1 - foldScale))
  const previewGap = -Math.round(format.height * (1 - previewScale))

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

      {/* Format picker + what to buy */}
      <div style={{ maxWidth: 1200, margin: '0 auto 28px' }}>
        <p style={{ color: 'var(--gray)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Format
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {FORMATS.map(f => {
            const active = f.key === formatKey
            return (
              <button
                key={f.key}
                onClick={() => setFormatKey(f.key)}
                style={{
                  textAlign: 'left',
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: active ? '1px solid var(--gold)' : '1px solid #333',
                  background: active ? 'rgba(200,168,78,0.12)' : 'transparent',
                  color: active ? 'var(--gold)' : '#bbb',
                  cursor: 'pointer',
                  minWidth: 190,
                  flex: '1 1 190px',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{f.label}</div>
                <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>{f.blurb}</div>
              </button>
            )
          })}
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid #2a2a2a',
          borderRadius: 10,
          padding: '14px 18px',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
              Paper to use
            </span>
            <span style={{ color: '#777', fontSize: 12 }}>
              {format.width} x {format.height} px &middot; {format.approxType}
            </span>
          </div>
          <p style={{ color: '#ccc', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{format.paper}</p>
          {formatKey === 'folded' && (
            <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, margin: '10px 0 0' }}>
              The PDF exports the two inside panels. Hand them to the print shop and ask for
              a double-sided 11 x 17 with a half fold; the cover and contact panels go on the
              reverse side.
            </p>
          )}
        </div>
      </div>

      {/* Download Buttons */}
      <div style={{ maxWidth: 1200, margin: '0 auto 48px', display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        {isMobile && (
          <button onClick={handleOpenPDF} disabled={!!status} style={{ ...btnStyle, background: 'transparent', color: 'var(--gold)', border: '1px solid var(--gold)', opacity: status ? 0.5 : 1 }}>
            <Eye size={18} /> Open PDF
          </button>
        )}
        <button onClick={handlePDF} disabled={!!status} style={{ ...btnStyle, background: 'var(--gold)', color: 'var(--black)', opacity: status ? 0.5 : 1 }}>
          <FileText size={18} /> Download PDF
        </button>
        <button onClick={handleImages} disabled={!!status} style={{ ...btnStyle, background: '#FFFFFF', color: '#111', opacity: status ? 0.5 : 1 }}>
          <FileImage size={18} /> Download Images
        </button>
        {formatKey === 'screen' && (
          <button onClick={handleVideos} disabled={!!status} style={{ ...btnStyle, background: '#333', color: '#FFF', opacity: status ? 0.5 : 1 }}>
            <Film size={18} /> Download Videos (for TV)
          </button>
        )}
      </div>

      {status && (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ color: 'var(--gold)', fontSize: 14, fontStyle: 'italic' }}>{status}</p>
        </div>
      )}

      {isMobile && (
        <div style={{
          maxWidth: 620, margin: '0 auto 32px', textAlign: 'center',
          background: 'rgba(255,255,255,0.04)', border: '1px solid #2a2a2a',
          borderRadius: 12, padding: '26px 22px',
        }}>
          <Smartphone size={26} style={{ color: 'var(--gold)', marginBottom: 10 }} />
          <p style={{ color: 'var(--white)', fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>
            Preview on a bigger screen
          </p>
          <p style={{ color: 'var(--gray)', fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' }}>
            These sheets are printed at 11 to 17 inches wide. Squeezed onto a phone
            they are too small to judge. Open the PDF instead — it is the exact file
            the printer gets.
          </p>
          <button
            onClick={handleOpenPDF}
            disabled={!!status}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 26px', borderRadius: 10, border: 'none',
              background: 'var(--gold)', color: 'var(--black)',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              opacity: status ? 0.5 : 1,
            }}
          >
            <Eye size={18} /> {status ? 'Building…' : 'Open PDF Preview'}
          </button>
        </div>
      )}

      {/* Previews — every sheet sits in one scale group so they print alike.
          Off-screen on mobile: still laid out for the export, just not shown. */}
      <div style={isMobile
        ? { position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }
        : undefined}>
      {sheetsMounted && (
      <ScaleGroupProvider>
      {formatKey === 'folded' ? (
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 44, alignItems: 'center' }}>
          {([
            { meal: 'Breakfast', key: 'bf', cats: breakfastCats },
            { meal: 'Lunch & Dinner', key: 'ln', cats: lunchCats },
          ] as const).map(({ meal, key, cats }) => {
            const [a, b, c] = spreadAcrossPanels(cats, getItems, 3)
            const sheets = [
              {
                id: `fold-${key}-outside`,
                label: 'Side 1 — outside (back panel | front cover)',
                left: <ContentPanel id={`${key}-c`} cats={c || []} getItems={getItems} />,
                right: <CoverPanel title={meal} />,
              },
              {
                id: `fold-${key}-inside`,
                label: 'Side 2 — inside (the spread)',
                left: <ContentPanel id={`${key}-a`} cats={a || []} getItems={getItems} />,
                right: <ContentPanel id={`${key}-b`} cats={b || []} getItems={getItems} />,
              },
            ]
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
                <p style={{ color: 'var(--gold)', fontSize: 15, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
                  {meal} — one letter sheet, landscape, folded once
                </p>
                {sheets.map(sh => (
                  <div key={sh.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <p style={{ color: 'var(--gray)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>
                      {sh.label}
                    </p>
                    <div style={{
                      transform: `scale(${foldScale})`,
                      transformOrigin: 'top center',
                      marginBottom: foldGap,
                    }}>
                      <div id={sh.id} style={{ border: '1px solid #333' }}>
                        <FoldedSheet left={sh.left} right={sh.right} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ) : (
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36, alignItems: 'center' }}>
          {/* Breakfast Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <p style={{ color: 'var(--gray)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Breakfast</p>
            <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top center', marginBottom: previewGap }}>
              <div id="menu-breakfast">
                <V1Page id="breakfast" cats={breakfastCats} getItems={getItems} title="Breakfast"
                  width={format.width} height={format.height} cols={format.cols} maxScale={format.maxScale} />
              </div>
            </div>
          </div>

          {/* Lunch & Dinner Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <p style={{ color: 'var(--gray)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Lunch & Dinner</p>
            <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top center', marginBottom: previewGap }}>
              <div id="menu-lunch">
                <V1Page id="lunch" cats={lunchCats} getItems={getItems} title="Lunch & Dinner"
                  width={format.width} height={format.height} cols={format.cols} maxScale={format.maxScale} />
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
      </ScaleGroupProvider>
      )}
      </div>
    </div>
  )
}

// The sheet is a fixed canvas but the menu is not fixed content. This measures
// the rendered columns and scales every font size until they fill the page
// without overflowing, so adding or removing items never silently clips the
// bottom of the menu (which it did before — six items were falling off lunch).
const MIN_SCALE = 0.6
const MAX_SCALE = 2.2
// Ceiling on how far the leading can open up. Past this a menu stops looking
// generous and starts looking padded.
const MAX_LEAD = 2.4

// Every sheet in a set prints at one size. A roomy breakfast menu scaling to
// 20pt next to a packed lunch menu at 15pt reads as two different documents,
// so each sheet reports the largest size it can take and they all adopt the
// smallest of those.
const ScaleGroup = createContext<{
  report: (id: string, scale: number) => void
  groupScale: number | null
}>({ report: () => {}, groupScale: null })

function ScaleGroupProvider({ children }: { children: React.ReactNode }) {
  const [scales, setScales] = useState<Record<string, number>>({})

  const report = useCallback((id: string, scale: number) => {
    setScales(prev => (prev[id] === scale ? prev : { ...prev, [id]: scale }))
  }, [])

  const groupScale = useMemo(() => {
    const vals = Object.values(scales)
    return vals.length ? Math.min(...vals) : null
  }, [scales])

  const value = useMemo(() => ({ report, groupScale }), [report, groupScale])
  return <ScaleGroup.Provider value={value}>{children}</ScaleGroup.Provider>
}

function useFitScale(id: string, deps: unknown[], maxScale: number = MAX_SCALE) {
  const { report, groupScale } = useContext(ScaleGroup)
  const boxRef = useRef<HTMLDivElement>(null)
  const [own, setOwn] = useState(1)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return

    let lo = MIN_SCALE
    let hi = maxScale
    let best = MIN_SCALE

    // Measure the font size against tight leading only. Leaving an expanded
    // --menu-lead in place here makes the content look far taller than it is
    // and drives the type size down every time the format changes.
    box.style.setProperty('--menu-lead', '1')

    const fitsAt = (s: number) => {
      box.style.setProperty('--menu-scale', String(s))
      // Force layout, then compare the tallest column against the page box.
      const tallest = Math.max(
        ...Array.from(box.children).map(c => (c as HTMLElement).scrollHeight)
      )
      return tallest <= box.clientHeight
    }

    // Binary search the largest scale that still fits. Text re-wraps as size
    // changes, so measuring beats computing a ratio.
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      if (fitsAt(mid)) { best = mid; lo = mid } else { hi = mid }
    }

    setOverflowing(best <= MIN_SCALE + 0.001 && !fitsAt(MIN_SCALE))
    setOwn(best)
    report(id, best)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // The group's smallest size wins once every sheet has reported.
  const applied = groupScale ?? own
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    box.style.setProperty('--menu-scale', String(applied))

    // Locking every sheet to the tightest one leaves the roomy sheets short.
    // Spread that slack through the leading — line spacing, gaps between
    // items, slightly more between categories — instead of opening a few
    // enormous holes in the page.
    const fillsAtLead = (lead: number) => {
      box.style.setProperty('--menu-lead', String(lead))
      const tallest = Math.max(
        ...Array.from(box.children).map(col => {
          const el = col as HTMLElement
          const blocks = el.children.length
          if (!blocks) return 0
          const last = el.children[blocks - 1] as HTMLElement
          return last.getBoundingClientRect().bottom - el.getBoundingClientRect().top
        })
      )
      return tallest <= box.clientHeight
    }

    let lo = 1
    let hi = MAX_LEAD
    let bestLead = 1
    if (fillsAtLead(1)) {
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2
        if (fillsAtLead(mid)) { bestLead = mid; lo = mid } else { hi = mid }
      }
    }
    box.style.setProperty('--menu-lead', String(bestLead))
  }, [applied])

  return { boxRef, scale: applied, overflowing }
}

// ── Folded menu ──────────────────────────────────────────────────────────────
// One sheet of letter paper, landscape, printed both sides and folded once
// down the middle. That gives four 5.5 x 8.5 panels: a cover and three pages
// of menu. Each meal gets its own sheet.
const PANEL_W = 825   // 5.5in at 150dpi
const PANEL_H = 1275  // 8.5in

// Split categories across N panels in menu order, minimising the fullest
// panel. Order is preserved, so this searches cut points rather than
// reshuffling categories.
function spreadAcrossPanels(
  cats: MenuCategory[],
  getItems: (id: string) => MenuItem[],
  panels: number,
): MenuCategory[][] {
  const w = cats.map(c => 2 + getItems(c.id).reduce((sum, i) => sum + itemWeight(i), 0))
  const n = cats.length
  let best: number[][] = []
  let bestCost = Infinity

  const walk = (start: number, left: number, acc: number[][]) => {
    if (left === 1) {
      const groups = [...acc, Array.from({ length: n - start }, (_, k) => start + k)]
      const cost = Math.max(...groups.map(g => g.reduce((t, i) => t + w[i], 0)))
      if (cost < bestCost) { bestCost = cost; best = groups }
      return
    }
    for (let cut = start + 1; cut <= n - left + 1; cut++) {
      walk(cut, left - 1, [...acc, Array.from({ length: cut - start }, (_, k) => start + k)])
    }
  }
  walk(0, panels, [])

  return best.map((g: number[]) => g.map(i => cats[i]))
}

function CoverPanel({ title }: { title: string }) {
  return (
    <div style={{
      width: PANEL_W, height: PANEL_H, background: '#FFFFFF', color: '#000000',
      boxSizing: 'border-box', padding: 40, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    }}>
      <img
        src="/logo-dark-transparent.png"
        alt="Tacos Miranda"
        crossOrigin="anonymous"
        style={{ width: '74%', marginBottom: 26 }}
      />
      <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', lineHeight: 1.1 }}>
        {title}
      </div>
      <div style={{ width: '60%', borderBottom: '3px solid #000', marginTop: 16 }} />
      <div style={{ fontSize: 13, color: '#555', marginTop: 36, lineHeight: 1.9 }}>
        21582 Brookhurst St<br />Huntington Beach, CA 92646<br />(657) 845-4011
      </div>
    </div>
  )
}

function ContentPanel({ id, cats, getItems }: {
  id: string
  cats: MenuCategory[]
  getItems: (id: string) => MenuItem[]
}) {
  const { boxRef, overflowing } = useFitScale(id, [cats, getItems])
  return (
    <div style={{
      width: PANEL_W, height: PANEL_H, background: '#FFFFFF', color: '#000000',
      boxSizing: 'border-box', padding: '34px 30px', position: 'relative',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    }}>
      {overflowing && (
        <div style={{
          position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
          background: '#dc2626', color: '#fff', fontSize: 9, fontWeight: 800,
          padding: '3px 8px', borderRadius: 3,
        }}>
          TOO MANY ITEMS TO FIT
        </div>
      )}
      <div ref={boxRef} style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {cats.map(cat => (
            <div key={cat.id} style={{ marginBottom: 'calc(10px * var(--menu-scale, 1) * var(--menu-lead, 1) * 1.35)' }}>
              <h3 style={{
                fontSize: 'calc(13px * var(--menu-scale, 1))', textAlign: 'center',
                margin: '0 0 3px', fontWeight: 900,
              }}>
                {cat.name}
              </h3>
              <div style={{ borderBottom: '1.5px solid #555', marginBottom: 'calc(5px * var(--menu-lead, 1))' }} />
              {getItems(cat.id).map(item => (
                <ItemRow key={item.id} item={item} nameColor="#000000" priceColor="#000000"
                  descColor="#2B2B2B" dotColor="#9A9A9A" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// A printed side of the folded sheet: two panels side by side, 11 x 8.5.
// Only the paper itself lives in here — labels stay outside so html2canvas
// never captures them onto the printed sheet.
function FoldedSheet({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', background: '#FFFFFF' }}>
      {left}
      {right}
    </div>
  )
}

interface PageProps {
  cats: MenuCategory[]
  getItems: (catId: string) => MenuItem[]
  id: string
  title: string
  width: number
  height: number
  cols: number
  maxScale: number
}

// Roughly how many description characters fit on one line in a single column.
const DESC_CHARS_PER_LINE = 62
// A description line is 8px against an 11px name line, so it costs less height.
const DESC_LINE_WEIGHT = 0.75

// Estimated vertical cost of one item: its name line plus however many lines
// its description wraps to. Counting items instead of lines is what put
// Burritos (8 items, long descriptions) and Sides (11 items, almost none) in
// the same column and overflowed it while the others sat half empty.
function itemWeight(item: MenuItem): number {
  const desc = (item.description || '').trim()
  const descLines = desc ? Math.ceil(desc.length / DESC_CHARS_PER_LINE) : 0
  return 1 + descLines * DESC_LINE_WEIGHT
}

function splitIntoColumns(cats: MenuCategory[], getItems: (id: string) => MenuItem[], cols: number) {
  const weighted = cats.map(c => ({
    cat: c,
    // 2 covers the category heading and its rule.
    count: 2 + getItems(c.id).reduce((sum, i) => sum + itemWeight(i), 0),
  }))
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
    <div style={{ marginBottom: 'calc(5px * var(--menu-scale, 1) * var(--menu-lead, 1))' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 'calc(11px * var(--menu-scale, 1))', fontWeight: 700, color: nameColor, whiteSpace: 'nowrap' }}>{item.name}</span>
        <span style={{ flex: 1, borderBottom: `1px solid ${dotColor}`, minWidth: 8 }} />
        <span style={{ fontSize: 'calc(11px * var(--menu-scale, 1))', fontWeight: 900, color: priceColor, whiteSpace: 'nowrap' }}>${item.price.toFixed(2)}</span>
      </div>
      {item.description && (
        <p style={{ fontSize: 'calc(8px * var(--menu-scale, 1))', color: descColor, marginTop: 1, lineHeight: 'calc(1.35em * (1 + (var(--menu-lead, 1) - 1) * 0.3))', fontWeight: 500 }}>{item.description}</p>
      )}
    </div>
  )
}

function V1Page({ cats, getItems, id, title, width, height, cols, maxScale }: PageProps) {
  // A light menu in three columns leaves short, ragged columns. Fewer columns
  // means taller content and a fuller page at the same type size.
  const itemCount = cats.reduce((n, c) => n + getItems(c.id).length, 0)
  const effectiveCols = cols > 1 && itemCount <= 28 ? cols - 1 : cols
  const columns = splitIntoColumns(cats, getItems, effectiveCols)
  const { boxRef, scale, overflowing } = useFitScale(id, [cats, getItems, width, height, effectiveCols, maxScale], maxScale)
  // White sheet, black ink, one plain sans. No color anywhere — this is a
  // document to be read, not a themed graphic.
  const bg = '#FFFFFF'
  const accent = '#000000'
  const textPrimary = '#000000'
  const priceColor = '#000000'
  const descColor = '#2B2B2B'
  const accentDim = '#555555'
  const dotDim = '#9A9A9A'

  return (
    <div style={{
      width, height, padding: '28px 36px',
      background: bg, border: `2px solid ${accent}`,
      fontFamily: "'Helvetica Neue', Helvetica, Arial, 'Inter', sans-serif",
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ position: 'absolute', top: 8, left: 8, width: 18, height: 18, borderTop: `2px solid ${accent}`, borderLeft: `2px solid ${accent}` }} />
      <div style={{ position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderTop: `2px solid ${accent}`, borderRight: `2px solid ${accent}` }} />
      <div style={{ position: 'absolute', bottom: 8, left: 8, width: 18, height: 18, borderBottom: `2px solid ${accent}`, borderLeft: `2px solid ${accent}` }} />
      <div style={{ position: 'absolute', bottom: 8, right: 8, width: 18, height: 18, borderBottom: `2px solid ${accent}`, borderRight: `2px solid ${accent}` }} />

      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <h1 style={{
          fontSize: `calc(26px * var(--menu-scale, 1))`, color: accent, fontWeight: 900, margin: 0,
          letterSpacing: 2, textTransform: 'uppercase',
        }}>
          {title}
        </h1>
        <div style={{ borderBottom: `2px solid ${accent}`, marginTop: 6 }} />
      </div>

      <div ref={boxRef} style={{ display: 'flex', gap: 22, flex: 1, minHeight: 0 }}>
        {columns.map((col, ci) => (
          <div key={ci} style={{ flex: 1, minWidth: 0 }}>
            {col.map(({ cat }) => (
              <div key={cat.id} style={{ marginBottom: 'calc(10px * var(--menu-scale, 1) * var(--menu-lead, 1) * 1.35)' }}>
                <h3 style={{ fontSize: 'calc(13px * var(--menu-scale, 1))', color: accent, textAlign: 'center', marginBottom: 3, fontWeight: 900 }}>{cat.name}</h3>
                <div style={{ borderBottom: `1.5px solid ${accentDim}`, marginBottom: 'calc(5px * var(--menu-lead, 1))' }} />
                {getItems(cat.id).map(item => (
                  <ItemRow key={item.id} item={item} nameColor={textPrimary} priceColor={priceColor} descColor={descColor} dotColor={dotDim} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      {overflowing && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 800,
          padding: '4px 10px', borderRadius: 4, letterSpacing: 0.5,
        }}>
          TOO MANY ITEMS TO FIT — SOME ARE HIDDEN
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 8, paddingTop: 8, borderTop: `1px solid ${accentDim}` }}>
        <p style={{ fontSize: 10, color: textPrimary, fontWeight: 600, margin: 0 }}>21582 Brookhurst St, Huntington Beach, CA 92646 | (657) 845-4011</p>
      </div>
    </div>
  )
}
