import { useCallback, useEffect, useRef, useState } from 'react'
import { Fingerprint, MapPin, Loader2, Check, X, AlertTriangle, Delete, Wifi, WifiOff } from 'lucide-react'

// ─── Offline-first staff clock ───────────────────────────────────────────────
// This kiosk is built to run with NO network in the critical path. Every punch
// is validated and recorded ON-DEVICE (PIN, geofence, clock-in/out math) and
// shown instantly, then synced to Supabase in the background whenever a
// connection is available. The device holds:
//   - the roster (names + PINs)        → PINs validate offline
//   - the geofence config              → distance check runs offline
//   - a local shift ledger (UUID-keyed)→ punches queue + sync idempotently
// A wall-mounted tablet can lose WiFi for days and never lose a punch.

const LS_LOG_KEY = 'tacos_clock_local_log'      // raw attempt log, safety net
const LS_GEO_KEY = 'tacos_clock_geo_cache'      // last device coords
const LS_ROSTER_KEY = 'tacos_clock_roster'      // cached staff + PINs
const LS_GEOFENCE_KEY = 'tacos_clock_geofence'  // cached allowed locations
const LS_SHIFTS_KEY = 'tacos_clock_shifts'      // device-owned shift ledger
const LS_LAST_SYNC_KEY = 'tacos_clock_last_sync'// ISO of last successful sync
const LS_ACKS_KEY = 'tacos_clock_pending_acks'  // server-flagged forgotten clock-outs awaiting acknowledgment
const LS_ACK_QUEUE_KEY = 'tacos_clock_ack_queue'// acknowledged shift ids not yet synced

const PIN_LENGTH = 6
const RESET_MS = 4000
const GEO_CACHE_MS = 2 * 24 * 60 * 60 * 1000   // 2 days — mounted, won't move
const TAP_DEBOUNCE_MS = 80
const FETCH_ATTEMPTS = 3
const FETCH_BACKOFF_MS = 500
const LONG_SHIFT_HOURS = 10
const SYNC_INTERVAL_MS = 60 * 1000             // flush queue every minute
const BOOTSTRAP_INTERVAL_MS = 5 * 60 * 1000    // refresh roster/geofence every 5 min

// Baked-in fallback so a brand-new device that has never synced still enforces
// a geofence. Kept in step with staff-clock-bootstrap's ALLOWED_LOCATIONS.
const DEFAULT_GEOFENCE: GeoLoc[] = [
  { name: 'Tacos Miranda', lat: 33.64934, lng: -117.95297, radius_m: 500 },
  { name: 'Home (test)', lat: 33.68983, lng: -117.92811, radius_m: 100 },
]

type GeoLoc = { name: string; lat: number; lng: number; radius_m: number }
type Staff = { id: string; first_name: string; last_name: string; pin: string; active: boolean }
type Shift = {
  id: string
  staff_id: string
  staff_name: string
  clock_in_at: string
  clock_out_at: string | null
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_out_lat: number | null
  clock_out_lng: number | null
  dirty: boolean
}

// ─── storage helpers ─────────────────────────────────────────────────────────
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch { return fallback }
}
function writeJSON(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

function getRoster(): Staff[] { return readJSON<Staff[]>(LS_ROSTER_KEY, []) }
function getGeofence(): GeoLoc[] {
  const cached = readJSON<GeoLoc[]>(LS_GEOFENCE_KEY, [])
  return cached.length ? cached : DEFAULT_GEOFENCE
}
function getShifts(): Shift[] { return readJSON<Shift[]>(LS_SHIFTS_KEY, []) }
function setShifts(shifts: Shift[]) { writeJSON(LS_SHIFTS_KEY, shifts) }

// Forgotten-clock-out acknowledgments. The server flags auto-closed shifts;
// the staff member must check a confirmation box on their next PIN entry.
type PendingAcks = Record<string, { strike: number; shift_ids: string[] }>
function getPendingAcks(): PendingAcks { return readJSON<PendingAcks>(LS_ACKS_KEY, {}) }
function setPendingAcks(acks: PendingAcks) { writeJSON(LS_ACKS_KEY, acks) }
function getAckQueue(): string[] { return readJSON<string[]>(LS_ACK_QUEUE_KEY, []) }
function setAckQueue(ids: string[]) { writeJSON(LS_ACK_QUEUE_KEY, ids) }
function getLastSync(): number | null {
  const raw = readJSON<string | null>(LS_LAST_SYNC_KEY, null)
  if (!raw) return null
  const t = new Date(raw).getTime()
  return isFinite(t) ? t : null
}

function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch { /* fall through */ }
  // RFC4122-ish fallback for older webviews.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ─── geo cache ───────────────────────────────────────────────────────────────
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
  writeJSON(LS_GEO_KEY, { lat, lng, savedAt: Date.now() })
}
function refreshGeoInBackground() {
  if (!navigator.geolocation) return
  navigator.geolocation.getCurrentPosition(
    (pos) => writeGeoCache(pos.coords.latitude, pos.coords.longitude),
    () => { /* ignore */ },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
  )
}

// ─── geofence math ───────────────────────────────────────────────────────────
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
function nearestAllowed(lat: number, lng: number, locations: GeoLoc[]) {
  let best = { name: '', distance: Infinity, allowed: false }
  for (const loc of locations) {
    const d = haversineMeters(loc.lat, loc.lng, lat, lng)
    if (d < best.distance) best = { name: loc.name, distance: d, allowed: d <= loc.radius_m }
  }
  return best
}

// ─── network ─────────────────────────────────────────────────────────────────
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown
  for (let i = 0; i < FETCH_ATTEMPTS; i++) {
    try {
      const res = await fetch(url, init)
      if (res.status >= 500 && i < FETCH_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, FETCH_BACKOFF_MS * (i + 1)))
        continue
      }
      return res
    } catch (err) {
      lastErr = err
      if (i < FETCH_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, FETCH_BACKOFF_MS * (i + 1)))
    }
  }
  throw lastErr
}

function authHeaders(anonKey: string) {
  return {
    'Content-Type': 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  }
}

// Pull roster + geofence + open shifts + pending acks from the server and merge
// into the local caches. Local dirty shifts always win (a pending offline
// clock-out is never clobbered). Non-dirty shifts the server no longer lists as
// open get dropped — that's how the device learns about the 10 PM auto-close
// and admin corrections, so the staff member isn't stuck "clocked in" locally.
async function bootstrap(url: string, anonKey: string): Promise<boolean> {
  try {
    const res = await fetchWithRetry(`${url}/functions/v1/staff-clock-bootstrap`, {
      method: 'POST',
      headers: authHeaders(anonKey),
      body: '{}',
    })
    if (!res.ok) return false
    const data = await res.json()
    if (Array.isArray(data.roster)) writeJSON(LS_ROSTER_KEY, data.roster)
    if (Array.isArray(data.geofence) && data.geofence.length) writeJSON(LS_GEOFENCE_KEY, data.geofence)

    if (Array.isArray(data.open_shifts)) {
      const roster = getRoster()
      const serverOpen = new Map<string, any>(
        data.open_shifts.filter((os: any) => os?.id).map((os: any) => [os.id, os]),
      )
      // Keep: dirty shifts (device-owned, not yet accepted) + shifts the server
      // still lists as open. Everything else is closed history — prune it.
      const local = getShifts().filter((s) => s.dirty || serverOpen.has(s.id))
      const byId = new Set(local.map((s) => s.id))
      serverOpen.forEach((os) => {
        if (byId.has(os.id)) return // keep local version (may be dirty)
        const st = roster.find((r) => r.id === os.staff_id)
        local.push({
          id: os.id,
          staff_id: os.staff_id,
          staff_name: st ? `${st.first_name} ${st.last_name}` : 'Staff',
          clock_in_at: os.clock_in_at,
          clock_out_at: null,
          clock_in_lat: os.clock_in_lat ?? null,
          clock_in_lng: os.clock_in_lng ?? null,
          clock_out_lat: null,
          clock_out_lng: null,
          dirty: false,
        })
      })
      setShifts(local)
    }

    // Server is the source of truth for pending acks, minus anything the staff
    // member already acknowledged on this device that hasn't synced yet.
    if (data.acks && typeof data.acks === 'object' && !Array.isArray(data.acks)) {
      const queued = new Set(getAckQueue())
      const next: PendingAcks = {}
      for (const [staffId, v] of Object.entries(data.acks as PendingAcks)) {
        const ids = Array.isArray(v?.shift_ids) ? v.shift_ids.filter((id) => !queued.has(id)) : []
        if (ids.length) next[staffId] = { strike: v.strike || ids.length, shift_ids: ids }
      }
      setPendingAcks(next)
    }
    return true
  } catch { return false }
}

// Flush every dirty shift + queued acknowledgment to the server. Idempotent:
// shifts carry device UUIDs, so a retried sync just re-upserts the same rows,
// and re-sent acks are no-ops server-side. Returns true on success.
async function syncQueue(url: string, anonKey: string): Promise<boolean> {
  const dirty = getShifts().filter((s) => s.dirty)
  const ackQueue = getAckQueue()
  if (dirty.length === 0 && ackQueue.length === 0) {
    writeJSON(LS_LAST_SYNC_KEY, new Date().toISOString())
    return true
  }
  try {
    const res = await fetchWithRetry(`${url}/functions/v1/staff-clock-sync`, {
      method: 'POST',
      headers: authHeaders(anonKey),
      body: JSON.stringify({ shifts: dirty, acks: ackQueue }),
    })
    if (!res.ok) return false
    const data = await res.json()
    const synced = new Set<string>(Array.isArray(data.synced) ? data.synced : [])
    const next = getShifts().map((s) => (synced.has(s.id) ? { ...s, dirty: false } : s))
    setShifts(next)
    const acked = new Set<string>(Array.isArray(data.acked) ? data.acked : [])
    if (acked.size > 0) setAckQueue(getAckQueue().filter((id) => !acked.has(id)))
    writeJSON(LS_LAST_SYNC_KEY, new Date().toISOString())
    return true
  } catch { return false }
}

function vibrate(ms: number) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { (navigator as Navigator).vibrate(ms) } catch { /* ignore */ }
  }
}

function timeAgo(ts: number | null): string {
  if (!ts) return 'never'
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

type Result = { action: 'clock_in' | 'clock_out'; staff_name: string; hours?: number }

type State =
  | { kind: 'idle' }
  | { kind: 'checking-geo' }
  | { kind: 'geo-blocked'; reason: string }
  | { kind: 'pin-entry' }
  | { kind: 'submitting' }
  | { kind: 'result'; result: Result }
  | { kind: 'confirm-long-shift'; staff_name: string; hours: number }
  | { kind: 'ack-required'; staff_id: string; staff_name: string; strike: number; shift_ids: string[] }
  | { kind: 'error'; message: string }

function ordinal(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

export default function StaffClock() {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [pin, setPin] = useState('')
  const [ackChecked, setAckChecked] = useState(false)
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [lastSync, setLastSync] = useState<number | null>(getLastSync())
  const [pending, setPending] = useState<number>(0)
  const [, setTick] = useState(0) // forces "Xm ago" to refresh
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null)
  const pendingPinRef = useRef<string>('')

  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
  const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

  const refreshIndicator = useCallback(() => {
    setPending(getShifts().filter((s) => s.dirty).length)
    setLastSync(getLastSync())
  }, [])

  // Try to flush the queue (and optionally refresh roster) right now.
  const runSync = useCallback(async (alsoBootstrap: boolean) => {
    if (!supabaseUrl || !anonKey || !navigator.onLine) return
    if (alsoBootstrap) await bootstrap(supabaseUrl, anonKey)
    await syncQueue(supabaseUrl, anonKey)
    refreshIndicator()
  }, [supabaseUrl, anonKey, refreshIndicator])

  // ─── kiosk lock-down: no zoom / scroll / overscroll bounce ──────────────────
  useEffect(() => {
    const vp = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
    const prevVp = vp?.content
    if (vp) {
      vp.content =
        'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover'
    }
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

  // Swap the page manifest so "Add to Home Screen" pins to this kiosk path.
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
      blobUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/json' }))
      link.href = blobUrl
    }
    return () => {
      document.title = prevTitle
      if (link && prevHref) link.href = prevHref
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [])

  // Online/offline tracking + background sync loop. Bootstrap + flush on mount,
  // whenever the connection returns, and on a steady interval.
  useEffect(() => {
    refreshIndicator()
    runSync(true)

    const goOnline = () => { setOnline(true); runSync(true) }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    const syncTimer = setInterval(() => runSync(false), SYNC_INTERVAL_MS)
    const bootTimer = setInterval(() => { if (navigator.onLine && supabaseUrl && anonKey) bootstrap(supabaseUrl, anonKey) }, BOOTSTRAP_INTERVAL_MS)
    const tickTimer = setInterval(() => setTick((t) => t + 1), 30 * 1000)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      clearInterval(syncTimer)
      clearInterval(bootTimer)
      clearInterval(tickTimer)
    }
  }, [runSync, refreshIndicator, supabaseUrl, anonKey])

  // Auto-reset to idle after any terminal state.
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
    const cached = readGeoCache()
    if (cached) {
      coordsRef.current = { lat: cached.lat, lng: cached.lng }
      setState({ kind: 'pin-entry' })
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

  // The whole punch decision happens locally. No network is required to clock
  // in or out — we record to the ledger, show the result, then sync in the bg.
  const submit = useCallback((pinValue: string, confirmLongShift: boolean) => {
    const coords = coordsRef.current
    if (!coords) {
      setState({ kind: 'error', message: 'Location not available. Try again.' })
      return
    }
    setState({ kind: 'submitting' })
    appendLocalLog({ event: 'submit', confirmLongShift })

    // 1. Geofence check (on-device).
    const near = nearestAllowed(coords.lat, coords.lng, getGeofence())
    if (!near.allowed) {
      const parts = ['You are not at an allowed location']
      if (isFinite(near.distance)) parts.push(`~${Math.round(near.distance)}m from ${near.name || 'nearest location'}`)
      parts.push(`Your coords: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`)
      appendLocalLog({ event: 'geo_blocked', distance: Math.round(near.distance) })
      setState({ kind: 'error', message: parts.join(' • ') })
      return
    }

    // 2. PIN lookup (on-device).
    const roster = getRoster()
    if (roster.length === 0) {
      setState({ kind: 'error', message: 'Device not set up yet. Connect to the internet once, then try again.' })
      return
    }
    const staff = roster.find((s) => s.pin === pinValue && s.active)
    if (!staff) {
      appendLocalLog({ event: 'bad_pin' })
      setState({ kind: 'error', message: 'Invalid PIN' })
      return
    }
    const fullName = `${staff.first_name} ${staff.last_name}`

    // 2b. Forgotten clock-out acknowledgment. If the server auto-closed one of
    // their shifts, they must check the confirmation box before punching.
    const pendingAck = getPendingAcks()[staff.id]
    if (pendingAck && pendingAck.shift_ids.length > 0) {
      pendingPinRef.current = pinValue
      setAckChecked(false)
      setState({
        kind: 'ack-required',
        staff_id: staff.id,
        staff_name: fullName,
        strike: pendingAck.strike,
        shift_ids: pendingAck.shift_ids,
      })
      return
    }

    // 3. Clock-in vs clock-out from the local ledger.
    const shifts = getShifts()
    const open = shifts.find((s) => s.staff_id === staff.id && !s.clock_out_at)
    const nowIso = new Date().toISOString()

    if (open) {
      const hours = (Date.now() - new Date(open.clock_in_at).getTime()) / 3_600_000
      if (hours >= LONG_SHIFT_HOURS && !confirmLongShift) {
        pendingPinRef.current = pinValue
        setState({ kind: 'confirm-long-shift', staff_name: fullName, hours: Math.round(hours * 100) / 100 })
        return
      }
      const next = shifts.map((s) =>
        s.id === open.id
          ? { ...s, clock_out_at: nowIso, clock_out_lat: coords.lat, clock_out_lng: coords.lng, dirty: true }
          : s,
      )
      setShifts(next)
      appendLocalLog({ event: 'ok', action: 'clock_out', staff: fullName, hours })
      setState({ kind: 'result', result: { action: 'clock_out', staff_name: fullName, hours: Math.round(hours * 100) / 100 } })
    } else {
      const shift: Shift = {
        id: uuid(),
        staff_id: staff.id,
        staff_name: fullName,
        clock_in_at: nowIso,
        clock_out_at: null,
        clock_in_lat: coords.lat,
        clock_in_lng: coords.lng,
        clock_out_lat: null,
        clock_out_lng: null,
        dirty: true,
      }
      setShifts([...shifts, shift])
      appendLocalLog({ event: 'ok', action: 'clock_in', staff: fullName })
      setState({ kind: 'result', result: { action: 'clock_in', staff_name: fullName } })
    }

    setPin('')
    refreshGeoInBackground()
    refreshIndicator()
    runSync(false) // fire-and-forget; the punch is already saved locally
  }, [refreshIndicator, runSync])

  // Staff checked the box: queue the acknowledgment for sync, clear the local
  // pending flag, and re-run the punch they were trying to make.
  const confirmAck = useCallback((staffId: string, shiftIds: string[]) => {
    const queue = new Set(getAckQueue())
    shiftIds.forEach((id) => queue.add(id))
    setAckQueue(Array.from(queue))
    const pending = getPendingAcks()
    delete pending[staffId]
    setPendingAcks(pending)
    appendLocalLog({ event: 'ack_confirmed', staff_id: staffId, shifts: shiftIds.length })
    submit(pendingPinRef.current, false)
  }, [submit]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-submit when PIN reaches length.
  useEffect(() => {
    if (pin.length === PIN_LENGTH && state.kind === 'pin-entry') submit(pin, false)
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

  // ─── styles ──────────────────────────────────────────────────────────────
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
  const statusBar: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    fontSize: 12,
    color: '#777',
    letterSpacing: 0.3,
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
    width: '100%', padding: '32px 24px', background: '#fbbf24', color: '#0a0a0a', border: 'none',
    borderRadius: 16, fontSize: 22, fontWeight: 800, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', gap: 12, letterSpacing: 0.5,
  }
  const padBtn: React.CSSProperties = {
    background: '#1f1f1f', color: '#fff', border: '1px solid #2f2f2f', borderRadius: 18, padding: 0,
    fontSize: 38, fontWeight: 700, height: 96, cursor: 'pointer', touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent', transition: 'transform 80ms ease-out, background 80ms ease-out',
  }
  const dot = (filled: boolean): React.CSSProperties => ({
    width: 26, height: 26, borderRadius: '50%', background: filled ? '#fbbf24' : 'transparent',
    border: '2px solid #fbbf24', transition: 'background 0.1s, transform 0.1s', transform: filled ? 'scale(1.1)' : 'scale(1)',
  })

  const syncLabel = pending > 0
    ? `${pending} pending • synced ${timeAgo(lastSync)}`
    : `Synced ${timeAgo(lastSync)}`

  // ─── render ──────────────────────────────────────────────────────────────
  return (
    <div style={page}>
      <div style={statusBar}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: online ? '#22c55e' : '#f59e0b' }}>
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          {online ? 'Online' : 'Offline'}
        </span>
        <span style={{ color: pending > 0 ? '#f59e0b' : '#777' }}>{syncLabel}</span>
      </div>

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
            <div style={{ marginTop: 12, fontSize: 14, color: '#aaa', lineHeight: 1.5 }}>{state.reason}</div>
          </>
        )}

        {state.kind === 'pin-entry' && (
          <>
            <style>{`.clock-pad-btn:active { transform: scale(0.93); background: #3a3a3a !important; }`}</style>
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
            <div style={{ marginTop: 12, fontSize: 20, color: '#ddd' }}>{state.result.staff_name}</div>
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
            <div style={{ marginTop: 14, fontSize: 22, fontWeight: 700 }}>Long Shift Check</div>
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

        {state.kind === 'ack-required' && (
          <>
            <AlertTriangle size={56} style={{ color: state.strike >= 3 ? '#ef4444' : '#f59e0b' }} />
            <div style={{ marginTop: 14, fontSize: 22, fontWeight: 700 }}>
              {state.strike === 1 ? 'Clock-Out Reminder' : `Forgotten Clock-Out (${ordinal(state.strike)} time)`}
            </div>
            <div style={{ marginTop: 12, fontSize: 16, color: '#ccc' }}>{state.staff_name}</div>
            <div style={{ marginTop: 14, fontSize: 15, color: '#ddd', lineHeight: 1.55, textAlign: 'left' }}>
              {state.strike === 1 && (
                <>You did not clock out your last shift. Please confirm you will remember to clock out today.</>
              )}
              {state.strike === 2 && (
                <>This is the 2nd time you have forgotten to clock out. Please confirm you will clock out every shift.</>
              )}
              {state.strike >= 3 && (
                <>This is the {ordinal(state.strike)} time you have forgotten to clock out.{' '}
                <b>Management will be contacting you regarding this.</b>{' '}
                Please confirm you will clock out every shift.</>
              )}
            </div>
            <label
              style={{
                marginTop: 20, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                background: '#1f1f1f', border: '1px solid ' + (ackChecked ? '#fbbf24' : '#2f2f2f'),
                borderRadius: 12, padding: '16px 14px', textAlign: 'left', fontSize: 15,
              }}
            >
              <input
                type="checkbox"
                checked={ackChecked}
                onChange={(e) => setAckChecked(e.target.checked)}
                style={{ width: 24, height: 24, accentColor: '#fbbf24', flexShrink: 0 }}
              />
              I will remember to clock out at the end of my shift.
            </label>
            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setState({ kind: 'idle' }); setPin(''); setAckChecked(false) }}
                style={{ ...bigButton, padding: '18px', fontSize: 16, background: '#2a2a2a', color: '#fff' }}
              >
                Cancel
              </button>
              <button
                disabled={!ackChecked}
                onClick={() => confirmAck(state.staff_id, state.shift_ids)}
                style={{
                  ...bigButton, padding: '18px', fontSize: 16,
                  background: ackChecked ? '#fbbf24' : '#3a3a3a',
                  color: ackChecked ? '#0a0a0a' : '#777',
                  cursor: ackChecked ? 'pointer' : 'not-allowed',
                }}
              >
                Confirm
              </button>
            </div>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <X size={56} style={{ color: '#ef4444' }} />
            <div style={{ marginTop: 14, fontSize: 20, fontWeight: 700 }}>{state.message}</div>
          </>
        )}
      </div>
    </div>
  )
}
