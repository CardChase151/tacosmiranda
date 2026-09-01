import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

function formatLine(left: string, right: string, width = 32): string {
  const rightLen = right.length
  const leftMax = width - rightLen - 1
  const l = left.length >= leftMax ? left.substring(0, leftMax) : left + ' '.repeat(leftMax - left.length)
  return l + ' ' + right
}

// --- Maintenance notice -------------------------------------------------
// Due date lives in the MAINTENANCE_DUE secret (YYYY-MM-DD) so it can be
// reset after a visit without redeploying. Unset or malformed = no banner.
const MAINTENANCE_DUE = Deno.env.get('MAINTENANCE_DUE') ?? ''

function todayInLA(): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function maintenanceBannerLines(): string[] {
  const due = (MAINTENANCE_DUE || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return []

  const dueMs = Date.parse(due + 'T00:00:00Z')
  const todayMs = Date.parse(todayInLA() + 'T00:00:00Z')
  if (Number.isNaN(dueMs) || Number.isNaN(todayMs)) return []

  const days = Math.round((dueMs - todayMs) / 86400000)

  let head: string
  let detail: string
  if (days > 0) {
    head = 'MAINTENANCE RECOMMENDED'
    detail = 'IN ' + days + (days === 1 ? ' DAY' : ' DAYS')
  } else if (days === 0) {
    head = 'MAINTENANCE RECOMMENDED'
    detail = 'TODAY'
  } else {
    const past = -days
    head = '** MAINTENANCE OVERDUE **'
    detail = past + (past === 1 ? ' DAY' : ' DAYS') + ' PAST RECOMMENDED'
  }

  return [
    '********************************',
    head,
    detail,
    'TO PREVENT ONLINE ORDERING',
    'INTERRUPTIONS',
    '********************************',
  ]
}

// --- Raw StarPRNT diagnostic ---------------------------------------------
const ESC = 0x1b
const enc = new TextEncoder()

function rawConcat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

// Under CloudPRNT this printer runs Star Line Mode, NOT ESC/POS. Confirmed by
// diagnostic 2026-06-10 and re-confirmed 2026-08-22:
//   IGNORED : GS!n (1D 21 nn), ESC!n (1B 21 nn), 1-byte ESC i n
//   WORKS   : ESC i n m (1B 69 n m) expansion, n=vertical-1, m=horizontal-1
//   WORKS   : ESC d 3 (1B 64 03) partial cut. ESC/POS GS V does NOT cut.
// Do not "simplify" these back to ESC/POS. They fail silently: the printer
// accepts the job, ACKs 200 OK, and prints flat unsized text with no cut.
const rawSize = (w: number, h: number): Uint8Array =>
  new Uint8Array([ESC, 0x69, Math.max(0, h - 1), Math.max(0, w - 1)])

const RAW_CUT = new Uint8Array([ESC, 0x64, 0x03])

function buildRawTestPrint(): Uint8Array {
  const INIT = new Uint8Array([ESC, 0x40])
  const ALIGN_C = new Uint8Array([ESC, 0x61, 0x01])
  const ALIGN_L = new Uint8Array([ESC, 0x61, 0x00])
  const BOLD_ON = new Uint8Array([ESC, 0x45, 0x01])
  const BOLD_OFF = new Uint8Array([ESC, 0x45, 0x00])
  const CUT = RAW_CUT
  const NORMAL = rawSize(1, 1)
  const t = (s: string) => enc.encode(s)

  const stamp = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date())

  return rawConcat([
    INIT, ALIGN_C,
    rawSize(2, 2), BOLD_ON, t('TEST PRINT\n'), BOLD_OFF, NORMAL,
    t('\n'),
    BOLD_ON,
    t('NOT A FOOD ORDER\n'),
    t('DO NOT PREPARE ANYTHING\n'),
    BOLD_OFF,
    t('\n'),
    ALIGN_L,
    t('Printer diagnostic sent by Chase\n'),
    t(stamp + '\n'),
    t('\n'),
    t('If you can read this line, the\n'),
    t('printer works fine and the online\n'),
    t('order problem is the format we\n'),
    t('were sending it. That is fixable.\n'),
    t('\n'),
    t('There is no customer and no food\n'),
    t('attached to this ticket. Please\n'),
    t('text Chase that it printed.\n'),
    t('\n'),
    ALIGN_C, BOLD_ON,
    t('NOT AN ORDER\n'),
    BOLD_OFF,
    t('\n\n'),
    CUT,
  ])
}

// --- Receipt layout ------------------------------------------------------
// 32 columns at normal width. Anything printed double-width must stay under
// 16 characters or it wraps.
const RECEIPT_COLS = 32

function padBetween(left: string, right: string, w = RECEIPT_COLS): string {
  const maxLeft = w - right.length - 1
  const l = left.length > maxLeft ? left.slice(0, maxLeft) : left
  const gap = Math.max(1, w - l.length - right.length)
  return l + ' '.repeat(gap) + right
}

function wrapLines(text: string, indent = ''): string[] {
  const limit = RECEIPT_COLS - indent.length
  const words = String(text).split(/\s+/).filter(Boolean)
  const out: string[] = []
  let line = ''
  for (const word of words) {
    if (!line.length) {
      line = word.length > limit ? word.slice(0, limit) : word
    } else if (line.length + 1 + word.length <= limit) {
      line += ' ' + word
    } else {
      out.push(indent + line)
      line = word.length > limit ? word.slice(0, limit) : word
    }
  }
  if (line.length) out.push(indent + line)
  return out
}

function buildRawReceipt(order: any, items: any[], mods: any[], ings: any[]): Uint8Array {
  const INIT = new Uint8Array([ESC, 0x40])
  const ALIGN_C = new Uint8Array([ESC, 0x61, 0x01])
  const ALIGN_L = new Uint8Array([ESC, 0x61, 0x00])
  const BOLD_ON = new Uint8Array([ESC, 0x45, 0x01])
  const BOLD_OFF = new Uint8Array([ESC, 0x45, 0x00])
  const CUT = RAW_CUT
  const NORMAL = rawSize(1, 1)
  const t = (s: string) => enc.encode(s)
  const RULE = '-'.repeat(RECEIPT_COLS)

  const p: Uint8Array[] = []
  const line = (s = '') => p.push(t(s + '\n'))

  const orderDate = new Date(order.created_at).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })

  const banner = maintenanceBannerLines()

  p.push(INIT, ALIGN_C)

  if (banner.length) {
    for (const b of banner) line(b)
    line()
  }

  p.push(rawSize(2, 2), BOLD_ON)
  line('TACOS MIRANDA')
  p.push(BOLD_OFF, NORMAL)
  line()

  p.push(rawSize(2, 2), BOLD_ON)
  line('ORDER ' + order.order_number)
  p.push(BOLD_OFF, NORMAL)
  line()

  p.push(ALIGN_L, BOLD_ON, rawSize(1, 2))
  line(order.customer_name || 'Guest')
  p.push(NORMAL, BOLD_OFF)
  if (order.customer_phone) line(order.customer_phone)
  line(orderDate)
  line()
  line(RULE)

  for (const item of items) {
    const itemMods = mods.filter((m: any) => m.order_item_id === item.id)
    const itemIngs = ings.filter((i: any) => i.order_item_id === item.id)
    const removed = itemIngs.filter((i: any) => i.action === 'remove')
    const extras = itemIngs.filter((i: any) => i.action === 'extra')

    // Items are the chef's anchor: double height so they carry the ticket.
    // Width stays 1x or the 32-column price alignment collapses.
    line()
    p.push(BOLD_ON, rawSize(1, 2))
    line(padBetween(
      item.quantity + 'x ' + item.item_name,
      '$' + Number(item.line_total).toFixed(2),
    ))
    p.push(NORMAL, BOLD_OFF)

    if (itemMods.length > 0) {
      for (const l of wrapLines(itemMods.map((m: any) => m.modifier_name).join(', '), '  ')) line(l)
    }
    if (removed.length > 0) {
      for (const l of wrapLines(removed.map((i: any) => 'NO ' + i.ingredient_name).join(', '), '  ')) line(l)
    }
    for (const e of extras) {
      const charge = Number(e.extra_charge) > 0 ? ' (+$' + Number(e.extra_charge).toFixed(2) + ')' : ''
      for (const l of wrapLines('EXTRA ' + e.ingredient_name + charge, '  ')) line(l)
    }
    if (item.special_instructions) {
      for (const l of wrapLines('** ' + item.special_instructions, '  ')) line(l)
    }
  }

  line()
  line(RULE)
  line(padBetween('Subtotal', '$' + Number(order.subtotal).toFixed(2)))
  line(padBetween('Tax', '$' + Number(order.tax).toFixed(2)))

  // Double height only: width stays 1 so the 32-column layout holds.
  p.push(BOLD_ON, rawSize(1, 2))
  line(padBetween('TOTAL', '$' + Number(order.total).toFixed(2)))
  p.push(NORMAL, BOLD_OFF)

  if (order.special_instructions) {
    line()
    p.push(BOLD_ON)
    line('NOTES:')
    p.push(BOLD_OFF)
    for (const l of wrapLines(order.special_instructions)) line(l)
  }

  line()
  p.push(ALIGN_C)
  line('(657) 845-4011')
  line('21582 Brookhurst St, HB CA 92646')

  if (banner.length) {
    line()
    for (const b of banner) line(b)
  }

  line()
  line()

  // Two copies per order, cut between and at the end: one for the kitchen,
  // one for the customer bag. Each copy re-sends INIT so state cannot leak.
  return rawConcat([...p, CUT, ...p, CUT])
}

serve(async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('', { headers })
  }

  // Check if this is the initial settings handshake
  const url = new URL(req.url)
  if (req.method === 'GET' && (url.pathname.includes('setting') || !url.searchParams.get('token') && !url.searchParams.get('jobToken'))) {
    // Could be the settings request OR a bare GET - return settings JSON
    if (!url.searchParams.get('token') && !url.searchParams.get('jobToken')) {
      return new Response(JSON.stringify({
        title: 'star_cloudprnt_server_setting',
        version: '1.0.0',
        serverSupportProtocol: ['HTTP'],
      }), { headers: { ...headers, 'Content-Type': 'application/json' } })
    }
  }

  // POST: Printer polling
  if (req.method === 'POST') {
    try {
      // Oldest job waiting: a new unprinted order, or any order an admin asked
      // to reprint from the dashboard (paper-out / bad-cut recovery).
      const { data: order } = await supabase
        .from('orders')
        .select('id, order_number, special_instructions')
        .or('and(printed.eq.false,status.eq.pending),reprint_requested.eq.true')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (order) {
        // Diagnostic orders are served as raw StarPRNT bytes instead of markup.
        // Real orders are untouched by this branch.
        if (/^__RAWTEST_/.test(order.special_instructions || '')) {
          return new Response(JSON.stringify({
            jobReady: true,
            mediaTypes: ['application/vnd.star.starprnt'],
            jobToken: order.id,
          }), { headers: { ...headers, 'Content-Type': 'application/json' } })
        }

        return new Response(JSON.stringify({
          // Raw StarPRNT only. Confirmed 2026-08-22: this TSP143IV accepts a
          // markup job, ACKs it 200 OK, and prints nothing. Raw bytes print.
          // Do not add markup back to this list.
          jobReady: true,
          mediaTypes: ['application/vnd.star.starprnt'],
          jobToken: order.id,
        }), { headers: { ...headers, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ jobReady: false }), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    } catch {
      return new Response(JSON.stringify({ jobReady: false }), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }
  }

  // GET: Printer fetching job
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const jobToken = url.searchParams.get('token') || url.searchParams.get('jobToken')

    if (!jobToken) {
      return new Response('Missing token', { status: 400, headers })
    }

    try {
      const { data: order } = await supabase
        .from('orders').select('*').eq('id', jobToken).single()

      if (!order) {
        return new Response('Not found', { status: 404, headers })
      }

      // Diagnostic path: raw StarPRNT bytes. Confirms whether this printer
      // renders raw when it will not render markup.
      if (/^__RAWTEST_/.test(order.special_instructions || '')) {
        // .buffer is safe here: rawConcat allocates an exact-length array
        return new Response(buildRawTestPrint().buffer as ArrayBuffer, {
          headers: { ...headers, 'Content-Type': 'application/vnd.star.starprnt' },
        })
      }

      const { data: items } = await supabase
        .from('order_items').select('*').eq('order_id', order.id).order('sort_order')

      const itemIds = (items || []).map((i: any) => i.id)
      const [modsRes, ingsRes] = await Promise.all([
        supabase.from('order_item_modifiers').select('*').in('order_item_id', itemIds),
        supabase.from('order_item_ingredients').select('*').in('order_item_id', itemIds),
      ])

      const mods = modsRes.data || []
      const ings = ingsRes.data || []

      const receipt = buildRawReceipt(order, items || [], mods, ings)

      return new Response(receipt.buffer as ArrayBuffer, {
        headers: { ...headers, 'Content-Type': 'application/vnd.star.starprnt' },
      })
    } catch (err: any) {
      return new Response(err.message, { status: 500, headers })
    }
  }

  // DELETE: Printer confirming print
  if (req.method === 'DELETE') {
    const url = new URL(req.url)
    const jobToken = url.searchParams.get('token') || url.searchParams.get('jobToken')

    if (jobToken) {
      // Always clear the reprint flag. Only advance a still-pending order to
      // confirmed so reprinting a completed order doesn't rewind its status.
      const { data: current } = await supabase
        .from('orders')
        .select('status')
        .eq('id', jobToken)
        .maybeSingle()

      const patch: Record<string, unknown> = { printed: true, reprint_requested: false }
      if (!current || current.status === 'pending') patch.status = 'confirmed'

      await supabase.from('orders').update(patch).eq('id', jobToken)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }

  return new Response('Method not allowed', { status: 405, headers })
})
