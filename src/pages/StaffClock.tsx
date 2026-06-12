import { useCallback, useEffect, useRef, useState } from 'react'
import { Fingerprint, MapPin, Loader2, Check, X, AlertTriangle, Delete } from 'lucide-react'

// Local log key — every attempted clock event is mirrored here as a safety net
// in case the network call fails (the edge function is still the source of truth).
const LS_LOG_KEY = 'tacos_clock_local_log'
// Cached last-known device location. Lets the kiosk skip the geolocation
// prompt on every tap (tablet is wall-mounted, won't move). Refreshed in the
// background after a successful clock event.
const LS_GEO_KEY = 'tacos_clock_geo_cache'
const PIN_LENGTH = 6
const RESET_MS = 4000
const GEO_CACHE_MS = 24 * 60 * 60 * 1000  // 24 hours
const TAP_DEBOUNCE_MS = 80                 // ghost-tap debounce
const FETCH_ATTEMPTS = 3
const FETCH_BACKOFF_MS = 500

function readGeoCache(): { lat: number; lng: number; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(LS_GEO_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (typeof obj?.lat !== 'number' || typeof obj?.lng !== 'number' || typeof obj?.savedAt !== 'number') return null
    if (Date.now() - obj.savedAt > GEO_CACHE_MS) return null
    return obj
  } catch { return null }
}

function writeGeoCache(lat: number, lng: number) {
  try {
    localStorage.setItem(LS_GEO_KEY, JSON.stringify({ lat, lng, savedAt: Date.now() }))
  } catch { /* ignore */ }
}

function refreshGeoInBackground() {
  if (!navigator.geolocation) return
  navigator.geolocation.getCurrentPosition(
    (pos) => writeGeoCache(pos.coords.latitude, pos.coords.longitude),
    () => { /* ignore */ },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
  )
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown
  for (let i = 0; i < FETCH_ATTEMPTS; i++) {
    try {
      const res = await fetch(url, init)
      // 5xx is worth retrying; 4xx is not.
      if (res.status >= 500 && i < FETCH_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, FETCH_BACKOFF_MS * (i + 1)))
        continue
      }
      return res
    } catch (err) {
      lastErr = err
      if (i < FETCH_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, FETCH_BACKOFF_MS * (i + 1)))
      }
    }
  }
  throw lastErr
}

function vibrate(ms: number) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { (navigator as Navigator).vibrate(ms) } catch { /* ignore */ }
  }
}

type Result = {
  action: 'clock_in' | 'clock_out'
  staff_name: string
  hours?: number
}

type State =
  | { kind: 'idle' }
  | { kind: 'checking-geo' }
  | { kind: 'geo-blocked'; reason: string; distance?: number }
  | { kind: 'pin-entry' }
  | { kind: 'submitting' }
  | { kind: 'result'; result: Result }
  | { kind: 'confirm-long-shift'; staff_name: string; hours: number }
  | { kind: 'error'; message: string }

export default function StaffClock() {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [pin, setPin] = useState('')
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null)
  const pendingPinRef = useRef<string>('')

  // Swap the page's manifest for a kiosk-specific one. Without this, the
  // site's default manifest sets start_url to "/" and "Add to Home Screen"
  // would launch the launcher icon back to the homepage. Setting scope to
  // this URL also keeps the PWA locked to the kiosk path — any wandering
  // navigation falls back to the browser instead of staying in the app.
  useEffect(() => {
    const prevTitle = document.title
    document.title = 'Staff Clock'
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
    const prevHref = link?.href
    let blobUrl: string | null = null
    if (link) {
      const manifest = {
        name: 'Staff Clock',
        short_name: 'Clock',
        start_url: window.location.pathname,
        scope: window.location.pathname,
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        icons: [
          { src: '/logo192.png', type: 'image/png', sizes: '192x192' },
          { src: '/logo512.png', type: 'image/png', sizes: '512x512' },
        ],
      }
      blobUrl = URL.createObjectURL(
        new Blob([JSON.stringify(manifest)], { type: 'application/json' }),
      )
      link.href = blobUrl
    }
    return () => {
      document.title = prevTitle
      if (link && prevHref) link.href = prevHref
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [])

  // Kiosk lock-down: the tablet is wall-mounted and should behave like a
  // fixed appliance. Kill pinch-zoom, double-tap zoom, scrolling, and the
  // Android/Chrome overscroll rubber-band so nothing wiggles under a tap.
  // Scoped to this page only (restored on unmount) so the public site keeps
  // normal zoom/scroll.
  useEffect(() => {
    // 1. Disable pinch + double-tap zoom via the viewport meta.
    const vp = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
    const prevVp = vp?.content
    if (vp) {
      vp.content =
        'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover'
    }

    // 2. Pin the page so nothing scrolls or rubber-bands.
    const html = document.documentElement
    const bodyEl = document.body
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: bodyEl.style.overflow,
      bodyPosition: bodyEl.style.position,
      bodyWidth: bodyEl.style.width,
      bodyHeight: bodyEl.style.height,
      bodyOverscroll: bodyEl.style.overscrollBehavior,
      bodyTouch: bodyEl.style.touchAction,
    }
    html.style.overflow = 'hidden'
    bodyEl.style.overflow = 'hidden'
    bodyEl.style.position = 'fixed'
    bodyEl.style.width = '100%'
    bodyEl.style.height = '100%'
    bodyEl.style.overscrollBehavior = 'none'
    bodyEl.style.touchAction = 'none'

    // 3. Belt-and-suspenders: cancel any multi-touch (pinch) gesture and the
    //    Safari gesture events that the viewport meta can't reach.
    const preventMulti = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault() }
    const preventGesture = (e: Event) => e.preventDefault()
    document.addEventListener('touchmove', preventMulti, { passive: false })
    document.addEventListener('gesturestart', preventGesture)

    return () => {
      if (vp && prevVp != null) vp.content = prevVp
      html.style.overflow = prev.htmlOverflow
      bodyEl.style.overflow = prev.bodyOverflow
      bodyEl.style.position = prev.bodyPosition
      bodyEl.style.width = prev.bodyWidth
      bodyEl.style.height = prev.bodyHeight
      bodyEl.style.overscrollBehavior = prev.bodyOverscroll
      bodyEl.style.touchAction = prev.bodyTouch
      document.removeEventListener('touchmove', preventMulti)
      document.removeEventListener('gesturestart', preventGesture)
    }
  }, [])

  // Auto-reset to idle after any terminal state. Errors stay longer so the
  // reader has time to scan coords/distance for debugging.
  useEffect(() => {
    if (state.kind === 'result' || state.kind === 'error' || state.kind === 'geo-blocked') {
      const delay = state.kind === 'error' ? 9000 : RESET_MS
      const t = setTimeout(() => {
        setState({ kind: 'idle' })
        setPin('')
        coordsRef.current = null
      }, delay)
      return () => clearTimeout(t)
    }
  }, [state.kind])

  const appendLocalLog = (entry: Record<string, unknown>) => {
    try {
      const raw = localStorage.getItem(LS_LOG_KEY)
      const log = raw ? (JSON.parse(raw) as unknown[]) : []
      log.push({ at: new Date().toISOString(), ...entry })
      if (log.length > 500) log.splice(0, log.length - 500)
      localStorage.setItem(LS_LOG_KEY, JSON.stringify(log))
    } catch { /* ignore */ }
  }

  const requestGeo = useCallback(() => {
    // Use cached coords instantly when available (24hr window). Tablet is
    // wall-mounted so the location doesn't really change between taps.
    const cached = readGeoCache()
    if (cached) {
      coordsRef.current = { lat: cached.lat, lng: cached.lng }
      setState({ kind: 'pin-entry' })
      // Quietly refresh in the background so the cache stays accurate.
      refreshGeoInBackground()
      return
    }

    setState({ kind: 'checking-geo' })
    if (!navigator.geolocation) {
      setState({ kind: 'geo-blocked', reason: 'This device does not support location services.' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        coordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        writeGeoCache(pos.coords.latitude, pos.coords.longitude)
        setState({ kind: 'pin-entry' })
      },
      (err) => {
        const reason = err.code === err.PERMISSION_DENIED
          ? 'Location access is blocked. Enable it for this site in browser settings.'
          : 'Could not read your location. Try again.'
        setState({ kind: 'geo-blocked', reason })
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    )
  }, [])

  const submit = useCallback(async (pinValue: string, confirmLongShift: boolean) => {
    if (!coordsRef.current) {
      setState({ kind: 'error', message: 'Location not available. Try again.' })
      return
    }
    setState({ kind: 'submitting' })

    const payload = {
      pin: pinValue,
      lat: coordsRef.current.lat,
      lng: coordsRef.current.lng,
      confirmLongShift,
    }

    appendLocalLog({ event: 'submit', confirmLongShift })

    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
    const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey) {
      setState({ kind: 'error', message: 'Configuration error.' })
      return
    }

    try {
      const res = await fetchWithRetry(`${supabaseUrl}/functions/v1/staff-clock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        appendLocalLog({ event: 'error', status: res.status, error: data.error })
        const parts: string[] = [data.error || 'Something went wrong']
        if (typeof data.distance_m === 'number') {
          parts.push(`~${data.distance_m}m from ${data.nearest || 'nearest location'}`)
        }
        if (typeof data.your_lat === 'number' && typeof data.your_lng === 'number') {
          parts.push(`Your coords: ${data.your_lat.toFixed(5)}, ${data.your_lng.toFixed(5)}`)
        }
        setState({ kind: 'error', message: parts.join(' • ') })
        return
      }

      appendLocalLog({ event: 'ok', action: data.action, staff: data.staff_name, hours: data.hours })

      if (data.action === 'confirm_long_shift') {
        pendingPinRef.current = pinValue
        setState({
          kind: 'confirm-long-shift',
          staff_name: data.staff_name,
          hours: data.hours,
        })
        return
      }

      setState({
        kind: 'result',
        result: {
          action: data.action,
          staff_name: data.staff_name,
          hours: data.hours,
        },
      })
      setPin('')
      // Refresh the cached location after every successful event so the
      // next person who walks up gets a fresh fix.
      refreshGeoInBackground()
    } catch (err: any) {
      appendLocalLog({ event: 'fetch_failed', message: err?.message })
      setState({ kind: 'error', message: 'Network error. Try again.' })
    }
  }, [])

  // Auto-submit when PIN reaches length.
  useEffect(() => {
    if (pin.length === PIN_LENGTH && state.kind === 'pin-entry') {
      submit(pin, false)
    }
  }, [pin, state.kind, submit])

  const lastTapRef = useRef(0)

  const onDigit = (d: string) => {
    if (state.kind !== 'pin-entry') return
    if (pin.length >= PIN_LENGTH) return
    const now = Date.now()
    if (now - lastTapRef.current < TAP_DEBOUNCE_MS) return
    lastTapRef.current = now
    vibrate(12)
    setPin((prev) => (prev.length >= PIN_LENGTH ? prev : prev + d))
  }
  const onBackspace = () => {
    if (state.kind !== 'pin-entry') return
    const now = Date.now()
    if (now - lastTapRef.current < TAP_DEBOUNCE_MS) return
    lastTapRef.current = now
    vibrate(12)
    setPin((prev) => prev.slice(0, -1))
  }

  // ─── styles ────────────────────────────────────────────────────────────────
  const page: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    height: '100%',
    width: '100%',
    background: '#0a0a0a',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    boxSizing: 'border-box',
    overflow: 'hidden',
    touchAction: 'none',
    overscrollBehavior: 'none',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  }
  const card: React.CSSProperties = {
    width: '100%',
    maxWidth: 560,
    background: '#161616',
    borderRadius: 24,
    padding: 36,
    border: '1px solid #2a2a2a',
    textAlign: 'center',
  }
  const bigButton: React.CSSProperties = {
    width: '100%',
    padding: '32px 24px',
    background: '#fbbf24',
    color: '#0a0a0a',
    border: 'none',
    borderRadius: 16,
    fontSize: 22,
    fontWeight: 800,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    letterSpacing: 0.5,
  }
  const padBtn: React.CSSProperties = {
    background: '#1f1f1f',
    color: '#fff',
    border: '1px solid #2f2f2f',
    borderRadius: 18,
    padding: 0,
    fontSize: 38,
    fontWeight: 700,
    height: 96,
    cursor: 'pointer',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
    transition: 'transform 80ms ease-out, background 80ms ease-out',
  }
  const dot = (filled: boolean): React.CSSProperties => ({
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: filled ? '#fbbf24' : 'transparent',
    border: '2px solid #fbbf24',
    transition: 'background 0.1s, transform 0.1s',
    transform: filled ? 'scale(1.1)' : 'scale(1)',
  })

  // ─── render by state ───────────────────────────────────────────────────────
  return (
    <div style={page}>
      <div style={card}>
        {state.kind === 'idle' && (
          <>
            <div style={{ fontSize: 14, color: '#888', letterSpacing: 2, marginBottom: 28 }}>STAFF</div>
            <button style={bigButton} onClick={requestGeo}>
              <Fingerprint size={28} /> ENTER PIN
            </button>
            <div style={{ marginTop: 28, fontSize: 12, color: '#555' }}>
              Location verification required
            </div>
          </>
        )}

        {state.kind === 'checking-geo' && (
          <>
            <Loader2 size={48} style={{ color: '#fbbf24', animation: 'spin 1s linear infinite' }} />
            <div style={{ marginTop: 20, fontSize: 18, color: '#ccc' }}>Checking location…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}

        {state.kind === 'geo-blocked' && (
          <>
            <MapPin size={56} style={{ color: '#ef4444' }} />
            <div style={{ marginTop: 16, fontSize: 22, fontWeight: 700 }}>Not at the shop</div>
            <div style={{ marginTop: 12, fontSize: 14, color: '#aaa', lineHeight: 1.5 }}>
              {state.reason}
            </div>
          </>
        )}

        {state.kind === 'pin-entry' && (
          <>
            <style>{`
              .clock-pad-btn:active {
                transform: scale(0.93);
                background: #3a3a3a !important;
              }
            `}</style>
            <div style={{ fontSize: 13, color: '#888', letterSpacing: 2, marginBottom: 22 }}>ENTER YOUR PIN</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 32 }}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div key={i} style={dot(i < pin.length)} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} className="clock-pad-btn" style={padBtn} onClick={() => onDigit(d)}>{d}</button>
              ))}
              <div />
              <button className="clock-pad-btn" style={padBtn} onClick={() => onDigit('0')}>0</button>
              <button
                className="clock-pad-btn"
                style={{ ...padBtn, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={onBackspace}
              >
                <Delete size={32} />
              </button>
            </div>
          </>
        )}

        {state.kind === 'submitting' && (
          <>
            <Loader2 size={48} style={{ color: '#fbbf24', animation: 'spin 1s linear infinite' }} />
            <div style={{ marginTop: 20, fontSize: 18, color: '#ccc' }}>Processing…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}

        {state.kind === 'result' && (
          <>
            <Check size={64} style={{ color: '#22c55e' }} />
            <div style={{ marginTop: 16, fontSize: 26, fontWeight: 800 }}>
              {state.result.action === 'clock_in' ? 'Clocked In' : 'Clocked Out'}
            </div>
            <div style={{ marginTop: 12, fontSize: 20, color: '#ddd' }}>
              {state.result.staff_name}
            </div>
            {state.result.hours != null && state.result.action === 'clock_out' && (
              <div style={{ marginTop: 14, fontSize: 16, color: '#aaa' }}>
                Worked {state.result.hours.toFixed(2)} hrs
              </div>
            )}
          </>
        )}

        {state.kind === 'confirm-long-shift' && (
          <>
            <AlertTriangle size={56} style={{ color: '#f59e0b' }} />
            <div style={{ marginTop: 14, fontSize: 22, fontWeight: 700 }}>
              Long Shift Check
            </div>
            <div style={{ marginTop: 14, fontSize: 15, color: '#ddd', lineHeight: 1.55 }}>
              You are about to end a shift that is <b>{state.hours.toFixed(1)} hrs</b> or more.
              If this was a mistake, please let the owner know immediately to resolve a work shift time.
            </div>
            <div style={{ marginTop: 22, display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setState({ kind: 'idle' }); setPin('') }}
                style={{ ...bigButton, padding: '18px', fontSize: 16, background: '#2a2a2a', color: '#fff' }}
              >
                Cancel
              </button>
              <button
                onClick={() => submit(pendingPinRef.current, true)}
                style={{ ...bigButton, padding: '18px', fontSize: 16, background: '#f59e0b' }}
              >
                Confirm Clock-Out
              </button>
            </div>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <X size={56} style={{ color: '#ef4444' }} />
            <div style={{ marginTop: 14, fontSize: 20, fontWeight: 700 }}>
              {state.message}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
