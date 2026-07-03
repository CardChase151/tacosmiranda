// Business hours stored as text like "7 AM" / "9:30 PM". Times are local to America/Los_Angeles.
// Helpers for: parsing, "is open right now", and "what's the next opening".

export interface BusinessHourRow {
  day_name: string
  day_order: number // 0 = Monday … 6 = Sunday (per existing data)
  open_time: string
  close_time: string
  is_closed: boolean
}

// One-off date override (holiday hours, early close). Takes priority over the
// weekly schedule for its date, everywhere: site display AND the online-order
// gate. Rows for past dates are simply ignored, so they expire on their own.
export interface SpecialHourRow {
  id: string
  date: string // 'YYYY-MM-DD' (America/Los_Angeles calendar date)
  label: string
  is_closed: boolean
  open_time: string
  close_time: string
}

/** Today's (or today+offset days') calendar date in America/Los_Angeles as 'YYYY-MM-DD'. */
export function laDateString(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Parses "7 AM" / "9:30 PM" / "12 PM" → minutes since midnight (0..1439). */
export function parseTimeToMinutes(text: string): number | null {
  if (!text) return null
  const m = text.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const mins = m[2] ? parseInt(m[2], 10) : 0
  const ampm = m[3].toUpperCase()
  if (ampm === 'AM') {
    if (h === 12) h = 0
  } else {
    if (h !== 12) h += 12
  }
  return h * 60 + mins
}

/** Returns the current minute-of-day + JS day-of-week in America/Los_Angeles. */
function nowInLA(): { minutes: number; jsDay: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(new Date())
  let h = 0
  let m = 0
  let weekday = 'Sun'
  for (const p of parts) {
    if (p.type === 'hour') h = parseInt(p.value, 10) % 24
    else if (p.type === 'minute') m = parseInt(p.value, 10)
    else if (p.type === 'weekday') weekday = p.value
  }
  const jsMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { minutes: h * 60 + m, jsDay: jsMap[weekday] ?? 0 }
}

/** Convert JS day-of-week (Sun=0..Sat=6) to the table's day_order (Mon=0..Sun=6). */
function jsDayToDayOrder(jsDay: number): number {
  return (jsDay + 6) % 7
}

export interface OpenStatus {
  isOpen: boolean
  /** Human-readable next-opening string for the closed message, e.g. "Monday at 7 AM". */
  nextOpenLabel?: string
  /** Today's open hours formatted as "7 AM – 9 PM" if applicable. */
  todayHoursLabel?: string
}

/** Effective hours for a given day: the special-date override if one exists, else the weekly row. */
function effectiveHours(
  rows: BusinessHourRow[],
  specials: SpecialHourRow[],
  todayDayOrder: number,
  offsetDays: number,
): { is_closed: boolean; open_time: string; close_time: string } | null {
  const special = specials.find(s => s.date === laDateString(offsetDays))
  if (special) return special
  const row = rows.find(r => r.day_order === (todayDayOrder + offsetDays) % 7)
  return row || null
}

/** Weekday name in LA for today+offset days, for "reopens Saturday at 7 AM" labels. */
function laWeekdayName(offsetDays: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
  }).format(new Date(Date.now() + offsetDays * 86_400_000))
}

/**
 * Computes whether the restaurant is currently open based on America/Los_Angeles time.
 * If the day is marked closed, isOpen is false. If parsing fails, defaults to OPEN
 * (fail-safe — better to take an order and call than refuse one).
 *
 * `closeBufferMin` shifts the effective close time earlier. Pass 30 from the online-
 * ordering gate so we stop accepting orders 30 min before walk-in close (kitchen
 * needs time to make the last order before shutting down).
 *
 * `specials` are one-off date overrides (holidays, early closes); when a row
 * matches today's LA date it wins over the weekly schedule.
 */
export function getOpenStatus(
  rows: BusinessHourRow[],
  closeBufferMin = 0,
  specials: SpecialHourRow[] = [],
): OpenStatus {
  if ((!rows || rows.length === 0) && specials.length === 0) return { isOpen: true }

  const { minutes, jsDay } = nowInLA()
  const todayDayOrder = jsDayToDayOrder(jsDay)
  const today = effectiveHours(rows || [], specials, todayDayOrder, 0)

  let isOpen = true
  let todayHoursLabel: string | undefined

  if (today) {
    todayHoursLabel = today.is_closed ? undefined : `${today.open_time} – ${today.close_time}`
    if (today.is_closed) {
      isOpen = false
    } else {
      const open = parseTimeToMinutes(today.open_time)
      const close = parseTimeToMinutes(today.close_time)
      if (open !== null && close !== null) {
        const effectiveClose = close - closeBufferMin
        isOpen = minutes >= open && minutes < effectiveClose
      }
    }
  }

  if (isOpen) return { isOpen: true, todayHoursLabel }

  // Find next opening day (special overrides considered for each future date).
  let nextOpenLabel: string | undefined
  for (let i = 0; i < 7; i++) {
    const eff = effectiveHours(rows || [], specials, todayDayOrder, i)
    if (!eff || eff.is_closed) continue
    // For today (i=0), only count if current time is before open.
    if (i === 0) {
      const open = parseTimeToMinutes(eff.open_time)
      if (open !== null && minutes < open) {
        nextOpenLabel = `today at ${eff.open_time}`
        break
      }
      continue
    }
    nextOpenLabel = i === 1 ? `tomorrow at ${eff.open_time}` : `${laWeekdayName(i)} at ${eff.open_time}`
    break
  }

  return { isOpen: false, nextOpenLabel, todayHoursLabel }
}
