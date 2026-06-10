import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL!,
  process.env.REACT_APP_SUPABASE_ANON_KEY!
)

const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  console.log(`[CloudPRNT] ${event.httpMethod} ${event.path}`)
  console.log(`[CloudPRNT]   UA: ${event.headers['user-agent'] || 'none'}`)
  console.log(`[CloudPRNT]   Accept: ${event.headers['accept'] || 'none'}`)
  console.log(`[CloudPRNT]   Content-Type: ${event.headers['content-type'] || 'none'}`)
  console.log(`[CloudPRNT]   Query: ${JSON.stringify(event.queryStringParameters || {})}`)
  if (event.body) {
    console.log(`[CloudPRNT]   Body: ${event.body.substring(0, 500)}`)
  }

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  // ── POST: Printer polling for jobs ──
  if (event.httpMethod === 'POST') {
    try {
      // Find oldest unprinted order
      const { data: order } = await supabase
        .from('orders')
        .select('id, order_number, special_instructions')
        .eq('printed', false)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (order) {
        // Test/diagnostic orders are returned as raw StarPRNT bytes (the
        // TSP143IV doesn't honor [mag] tags in markup mode).
        const isTest = /^__TEST_/.test(order.special_instructions || '')
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            jobReady: true,
            mediaTypes: isTest
              ? ['application/vnd.star.starprnt']
              : ['text/vnd.star.markup'],
            jobToken: order.id,
          }),
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ jobReady: false }),
      }
    } catch {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ jobReady: false }),
      }
    }
  }

  // ── GET: Printer fetching the print job ──
  if (event.httpMethod === 'GET') {
    const jobToken = event.queryStringParameters?.token ||
      event.queryStringParameters?.jobToken ||
      event.path.split('/').pop()

    if (!jobToken) {
      return { statusCode: 400, headers, body: 'Missing job token' }
    }

    try {
      // Fetch the order
      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('id', jobToken)
        .single()

      if (!order) {
        return { statusCode: 404, headers, body: 'Order not found' }
      }

      // ── Test-receipt mode (font-size testing). Triggered by a marker in
      //    special_instructions. Returns raw ESC/POS bytes (the TSP143IV
      //    doesn't honor [mag] tags via CloudPRNT markup) printed twice
      //    with a partial cut between copies. ──
      const testMatch = (order.special_instructions || '').match(/^__TEST_RECEIPT_V([123])__/)
      if (testMatch) {
        const variation = parseInt(testMatch[1], 10) as 1 | 2 | 3
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/vnd.star.starprnt' },
          body: buildRawTestVariation(variation),
          isBase64Encoded: true,
        }
      }

      // ── Size diagnostic: one sheet sampling many character sizes via
      //    raw ESC/POS so we can see exactly which sizes render. ──
      if ((order.special_instructions || '').startsWith('__TEST_DIAGNOSTIC__')) {
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/vnd.star.starprnt' },
          body: buildRawDiagnostic(),
          isBase64Encoded: true,
        }
      }

      // Fetch order items
      const { data: items } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', order.id)
        .order('sort_order')

      // Fetch modifiers and ingredients for all items
      const itemIds = (items || []).map(i => i.id)
      const [modsRes, ingsRes] = await Promise.all([
        supabase.from('order_item_modifiers').select('*').in('order_item_id', itemIds),
        supabase.from('order_item_ingredients').select('*').in('order_item_id', itemIds),
      ])

      const mods = modsRes.data || []
      const ings = ingsRes.data || []

      // Format the receipt
      const orderDate = new Date(order.created_at).toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })

      let receipt = ''
      receipt += `[align: center]\n`
      receipt += `[mag: w 2; h 2]TACOS MIRANDA[mag]\n`
      receipt += `\n`
      receipt += `[mag: w 2; h 1]ORDER ${order.order_number}[mag]\n`
      receipt += `\n`
      receipt += `[align: left]\n`
      receipt += `[bold: on]${order.customer_name || 'Guest'}[bold: off]\n`
      if (order.customer_phone) {
        receipt += `${order.customer_phone}\n`
      }
      receipt += `${orderDate}\n`
      receipt += `\n`
      receipt += `--------------------------------\n`

      for (const item of (items || [])) {
        const itemMods = mods.filter(m => m.order_item_id === item.id)
        const itemIngs = ings.filter(i => i.order_item_id === item.id)
        const removed = itemIngs.filter(i => i.action === 'remove')
        const extras = itemIngs.filter(i => i.action === 'extra')

        receipt += `\n`
        receipt += `[bold: on][column: left: ${item.quantity}x ${item.item_name}; right: $${Number(item.line_total).toFixed(2)}][bold: off]\n`

        if (itemMods.length > 0) {
          receipt += `  ${itemMods.map(m => m.modifier_name).join(', ')}\n`
        }

        if (removed.length > 0) {
          receipt += `  ${removed.map(i => `NO ${i.ingredient_name}`).join(', ')}\n`
        }

        if (extras.length > 0) {
          for (const e of extras) {
            const charge = Number(e.extra_charge) > 0 ? ` (+$${Number(e.extra_charge).toFixed(2)})` : ''
            receipt += `  EXTRA ${e.ingredient_name}${charge}\n`
          }
        }

        if (item.special_instructions) {
          receipt += `  ** ${item.special_instructions}\n`
        }
      }

      receipt += `\n`
      receipt += `--------------------------------\n`
      receipt += `[column: left: Subtotal; right: $${Number(order.subtotal).toFixed(2)}]\n`
      receipt += `[column: left: Tax; right: $${Number(order.tax).toFixed(2)}]\n`
      receipt += `[bold: on][mag: w 1; h 2][column: left: TOTAL; right: $${Number(order.total).toFixed(2)}][mag][bold: off]\n`

      if (order.special_instructions) {
        receipt += `\n`
        receipt += `[bold: on]NOTES:[bold: off]\n`
        receipt += `${order.special_instructions}\n`
      }

      receipt += `\n`
      receipt += `[align: center]\n`
      receipt += `(657) 845-4011\n`
      receipt += `21582 Brookhurst St, HB CA 92646\n`
      receipt += `\n`
      receipt += `[cut: feed; partial]\n`

      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'text/vnd.star.markup',
        },
        body: receipt,
      }
    } catch (err: any) {
      console.error('CloudPRNT GET error:', err)
      return { statusCode: 500, headers, body: err.message }
    }
  }

  // ── DELETE: Printer confirming job was printed ──
  if (event.httpMethod === 'DELETE') {
    const jobToken = event.queryStringParameters?.token ||
      event.queryStringParameters?.jobToken ||
      event.path.split('/').pop()

    if (jobToken) {
      await supabase
        .from('orders')
        .update({ printed: true, status: 'confirmed' })
        .eq('id', jobToken)
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
  }

  return { statusCode: 405, headers, body: 'Method not allowed' }
}

export { handler }

// ── Raw ESC/POS test-receipt builders ────────────────────────────────────────
// Sent as application/vnd.star.starprnt with isBase64Encoded:true. We use this
// path because the TSP143IV ignores [mag] tags in markup mode, but reliably
// honors raw GS!n size commands (which is also what scripts/print-server.js
// uses over local TCP).

const ESC = 0x1b
const GS = 0x1d

const RAW_INIT       = Buffer.from([ESC, 0x40])
const RAW_ALIGN_C    = Buffer.from([ESC, 0x61, 0x01])
const RAW_ALIGN_L    = Buffer.from([ESC, 0x61, 0x00])
const RAW_BOLD_ON    = Buffer.from([ESC, 0x45, 0x01])
const RAW_BOLD_OFF   = Buffer.from([ESC, 0x45, 0x00])
const RAW_CUT        = Buffer.from([GS, 0x56, 0x42, 0x03]) // partial cut + feed
const rawSize = (w: number, h: number): Buffer =>
  Buffer.from([GS, 0x21, ((w - 1) << 4) | (h - 1)])
const RAW_NORMAL = rawSize(1, 1)
const t = (s: string): Buffer => Buffer.from(s, 'utf8')

type RawSpec = {
  label: string
  header: [number, number]
  orderNum: [number, number]
  body: [number, number]
  total: [number, number]
  cols: number
}

const RAW_SPECS: Record<1 | 2 | 3, RawSpec> = {
  1: { label: 'VARIATION 1 (slightly bigger)',   header: [2, 2], orderNum: [2, 2], body: [1, 2], total: [2, 2], cols: 32 },
  2: { label: 'VARIATION 2 (noticeably bigger)', header: [2, 3], orderNum: [2, 2], body: [2, 2], total: [2, 3], cols: 16 },
  3: { label: 'VARIATION 3 (largest)',           header: [2, 3], orderNum: [2, 3], body: [2, 3], total: [2, 4], cols: 16 },
}

const RAW_ITEMS = [
  { qty: 2, name: 'Carne Asada Tacos',  price: 15.00, notes: ['add cheese, sour cream', 'NO onions'] },
  { qty: 1, name: 'California Burrito', price: 14.99, notes: ['EXTRA guacamole (+$1.50)'] },
  { qty: 1, name: 'Horchata',           price: 3.50,  notes: ['** large please'] },
]

function padLeftStr(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s
}

function padBetweenStr(left: string, right: string, n: number): string {
  const gap = Math.max(1, n - left.length - right.length)
  return left + ' '.repeat(gap) + right
}

function buildSingleRawTest(variation: 1 | 2 | 3): Buffer[] {
  const v = RAW_SPECS[variation]
  const dashes = '-'.repeat(v.cols)
  const parts: Buffer[] = []

  parts.push(RAW_INIT)
  parts.push(RAW_ALIGN_C)
  parts.push(RAW_NORMAL)
  parts.push(t(`-- ${v.label} --\n\n`))

  parts.push(rawSize(v.header[0], v.header[1]), RAW_BOLD_ON, t('TACOS MIRANDA\n'), RAW_BOLD_OFF)
  parts.push(RAW_NORMAL, t('\n'))

  parts.push(rawSize(v.orderNum[0], v.orderNum[1]), RAW_BOLD_ON, t(`ORDER TST${variation}\n`), RAW_BOLD_OFF)
  parts.push(RAW_NORMAL, t('\n'))

  parts.push(RAW_ALIGN_L)
  parts.push(rawSize(v.body[0], v.body[1]))
  parts.push(RAW_BOLD_ON, t('Test Customer\n'), RAW_BOLD_OFF)
  parts.push(t('(714) 555-1234\n'))
  parts.push(t('Today, 2:45 PM\n'))
  parts.push(t('\n'))
  parts.push(t(dashes + '\n'))

  for (const item of RAW_ITEMS) {
    parts.push(t('\n'))
    const priceStr = `$${item.price.toFixed(2)}`
    parts.push(RAW_BOLD_ON)
    if (v.cols >= 28) {
      parts.push(t(padBetweenStr(`${item.qty}x ${item.name}`, priceStr, v.cols) + '\n'))
    } else {
      parts.push(t(`${item.qty}x ${item.name}\n`))
      parts.push(t(padLeftStr(priceStr, v.cols) + '\n'))
    }
    parts.push(RAW_BOLD_OFF)
    for (const note of item.notes) {
      parts.push(t(`  ${note}\n`))
    }
  }

  parts.push(t('\n'))
  parts.push(t(dashes + '\n'))
  parts.push(t(padBetweenStr('Subtotal', '$33.49', v.cols) + '\n'))
  parts.push(t(padBetweenStr('Tax', '$2.93', v.cols) + '\n'))

  parts.push(rawSize(v.total[0], v.total[1]), RAW_BOLD_ON, t('TOTAL  $36.42\n'), RAW_BOLD_OFF)
  parts.push(RAW_NORMAL)

  parts.push(t('\n'))
  parts.push(RAW_ALIGN_C)
  parts.push(t('(657) 845-4011\n'))
  parts.push(t('21582 Brookhurst St\n'))
  parts.push(t('HB CA 92646\n'))
  parts.push(t('\n\n'))

  return parts
}

function buildRawTestVariation(variation: 1 | 2 | 3): string {
  const single = buildSingleRawTest(variation)
  const all = Buffer.concat([
    ...single, RAW_CUT,
    ...single, RAW_CUT,
  ])
  return all.toString('base64')
}

function buildRawDiagnostic(): string {
  // Tries every plausible size command this printer might support. Each
  // attempt is bracketed by a reset so the next label starts at default.
  // The reader compares each labeled line to BASELINE to find which command
  // actually grew the text.
  const parts: Buffer[] = []

  parts.push(RAW_INIT, RAW_ALIGN_C, t('SIZE TEST v2\n\n'), RAW_ALIGN_L)
  parts.push(t('BASELINE: Aa1Aa1Aa1\n\n'))

  // -- ESC/POS GS!n (we already know this doesn't work, included as control)
  parts.push(t('-- GS!n (ESC/POS) --\n'))
  parts.push(Buffer.from([GS, 0x21, 0x11]), t('GSn 2x2: Aa1\n'),  Buffer.from([GS, 0x21, 0x00]))
  parts.push(Buffer.from([GS, 0x21, 0x22]), t('GSn 3x3: Aa1\n'),  Buffer.from([GS, 0x21, 0x00]))
  parts.push(t('\n'))

  // -- ESC/POS ESC!n (print mode bits: bit4=2H, bit5=2W) --
  parts.push(t('-- ESC!n (ESC/POS) --\n'))
  parts.push(Buffer.from([ESC, 0x21, 0x10]), t('ESC!10 (2H): Aa1\n'), Buffer.from([ESC, 0x21, 0x00]))
  parts.push(Buffer.from([ESC, 0x21, 0x20]), t('ESC!20 (2W): Aa1\n'), Buffer.from([ESC, 0x21, 0x00]))
  parts.push(Buffer.from([ESC, 0x21, 0x30]), t('ESC!30 (2x2): Aa1\n'), Buffer.from([ESC, 0x21, 0x00]))
  parts.push(t('\n'))

  // -- Star Line Mode ESC i n (one byte: bit0=2H, bit1=2W) --
  parts.push(t('-- ESC i n (Star 1byte) --\n'))
  parts.push(Buffer.from([ESC, 0x69, 0x01]), t('ESCi1 (2H): Aa1\n'), Buffer.from([ESC, 0x69, 0x00]))
  parts.push(Buffer.from([ESC, 0x69, 0x02]), t('ESCi2 (2W): Aa1\n'), Buffer.from([ESC, 0x69, 0x00]))
  parts.push(Buffer.from([ESC, 0x69, 0x03]), t('ESCi3 (2x2): Aa1\n'), Buffer.from([ESC, 0x69, 0x00]))
  parts.push(t('\n'))

  // -- Star Line Mode ESC i n m (two byte: n=vert, m=horiz) --
  parts.push(t('-- ESC i n m (Star 2byte) --\n'))
  parts.push(Buffer.from([ESC, 0x69, 0x01, 0x01]), t('ESCi 1 1: Aa1\n'), Buffer.from([ESC, 0x69, 0x00, 0x00]))
  parts.push(Buffer.from([ESC, 0x69, 0x02, 0x02]), t('ESCi 2 2: Aa1\n'), Buffer.from([ESC, 0x69, 0x00, 0x00]))
  parts.push(Buffer.from([ESC, 0x69, 0x05, 0x05]), t('ESCi 5 5: Aa1\n'), Buffer.from([ESC, 0x69, 0x00, 0x00]))
  parts.push(t('\n'))

  // -- Star Line Mode ESC h n (height multiplier) --
  parts.push(t('-- ESC h n (Star height) --\n'))
  parts.push(Buffer.from([ESC, 0x68, 0x01]), t('ESCh1: Aa1\n'), Buffer.from([ESC, 0x68, 0x00]))
  parts.push(Buffer.from([ESC, 0x68, 0x03]), t('ESCh3: Aa1\n'), Buffer.from([ESC, 0x68, 0x00]))
  parts.push(Buffer.from([ESC, 0x68, 0x05]), t('ESCh5: Aa1\n'), Buffer.from([ESC, 0x68, 0x00]))
  parts.push(t('\n'))

  // -- Star Line Mode ESC W n (width multiplier) --
  parts.push(t('-- ESC W n (Star width) --\n'))
  parts.push(Buffer.from([ESC, 0x57, 0x01]), t('ESCW1: Aa1\n'), Buffer.from([ESC, 0x57, 0x00]))
  parts.push(Buffer.from([ESC, 0x57, 0x03]), t('ESCW3: Aa1\n'), Buffer.from([ESC, 0x57, 0x00]))
  parts.push(t('\n'))

  parts.push(t('BASELINE: Aa1Aa1Aa1\n\n'))
  parts.push(RAW_ALIGN_C, t('== end ==\n\n'), RAW_CUT)
  return Buffer.concat(parts).toString('base64')
}

