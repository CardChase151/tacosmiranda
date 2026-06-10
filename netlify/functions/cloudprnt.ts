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
        .select('id, order_number')
        .eq('printed', false)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (order) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            jobReady: true,
            mediaTypes: ['text/vnd.star.markup'],
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
      //    special_instructions. Returns a sample receipt at a chosen size
      //    variation, printed twice with a partial cut between copies. ──
      const testMatch = (order.special_instructions || '').match(/^__TEST_RECEIPT_V([123])__/)
      if (testMatch) {
        const variation = parseInt(testMatch[1], 10) as 1 | 2 | 3
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'text/vnd.star.markup' },
          body: buildTestReceiptMarkup(variation),
        }
      }

      // ── Size diagnostic: prints a single sheet showing every common
      //    [mag] combination so we can see which sizes the printer
      //    actually honors. ──
      if ((order.special_instructions || '').startsWith('__TEST_DIAGNOSTIC__')) {
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'text/vnd.star.markup' },
          body: buildDiagnosticReceipt(),
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

// ── Test-receipt builder ──────────────────────────────────────────────────────
// Three font-size variations of a sample online order, used to pick the size
// the shop wants on the real receipts. Each call returns markup that prints two
// copies separated by a partial cut.

type TestSpec = {
  label: string
  header: [number, number]
  orderNum: [number, number]
  body: [number, number]
  total: [number, number]
  cols: number
}

const TEST_SPECS: Record<1 | 2 | 3, TestSpec> = {
  1: { label: 'VARIATION 1 (slightly bigger)',   header: [2, 2], orderNum: [2, 2], body: [1, 2], total: [2, 2], cols: 32 },
  2: { label: 'VARIATION 2 (noticeably bigger)', header: [2, 3], orderNum: [2, 2], body: [2, 2], total: [2, 3], cols: 16 },
  3: { label: 'VARIATION 3 (largest)',           header: [2, 3], orderNum: [2, 3], body: [2, 3], total: [2, 4], cols: 16 },
}

const TEST_ITEMS = [
  { qty: 2, name: 'Carne Asada Tacos',  price: 15.00, notes: ['add cheese, sour cream', 'NO onions'] },
  { qty: 1, name: 'California Burrito', price: 14.99, notes: ['EXTRA guacamole (+$1.50)'] },
  { qty: 1, name: 'Horchata',           price: 3.50,  notes: ['** large please'] },
]

function padLeft(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s
}

function padBetween(left: string, right: string, n: number): string {
  const gap = Math.max(1, n - left.length - right.length)
  return left + ' '.repeat(gap) + right
}

function mag(w: number, h: number, text: string): string {
  return `[mag: w ${w}; h ${h}]${text}[mag]`
}

function buildSingleTestReceipt(variation: 1 | 2 | 3): string {
  const v = TEST_SPECS[variation]
  const M = (txt: string) => mag(v.body[0], v.body[1], txt)
  const dashes = '-'.repeat(v.cols)

  let s = ''
  s += `[align: center]\n`
  s += `-- ${v.label} --\n`
  s += `\n`
  s += `${mag(v.header[0], v.header[1], '[bold: on]TACOS MIRANDA[bold: off]')}\n`
  s += `\n`
  s += `${mag(v.orderNum[0], v.orderNum[1], `[bold: on]ORDER TST${variation}[bold: off]`)}\n`
  s += `\n`
  s += `[align: left]\n`
  s += `${M('[bold: on]Test Customer[bold: off]')}\n`
  s += `${M('(714) 555-1234')}\n`
  s += `${M('Today, 2:45 PM')}\n`
  s += `\n`
  s += `${M(dashes)}\n`

  for (const item of TEST_ITEMS) {
    s += `\n`
    const priceStr = `$${item.price.toFixed(2)}`
    if (v.cols >= 28) {
      s += `${M(`[bold: on]${padBetween(`${item.qty}x ${item.name}`, priceStr, v.cols)}[bold: off]`)}\n`
    } else {
      s += `${M(`[bold: on]${item.qty}x ${item.name}[bold: off]`)}\n`
      s += `${M(padLeft(priceStr, v.cols))}\n`
    }
    for (const note of item.notes) {
      s += `${M(`  ${note}`)}\n`
    }
  }

  s += `\n`
  s += `${M(dashes)}\n`
  s += `${M(padBetween('Subtotal', '$33.49', v.cols))}\n`
  s += `${M(padBetween('Tax', '$2.93', v.cols))}\n`
  s += `${mag(v.total[0], v.total[1], `[bold: on]TOTAL  $36.42[bold: off]`)}\n`
  s += `\n`
  s += `[align: center]\n`
  s += `(657) 845-4011\n`
  s += `21582 Brookhurst St\n`
  s += `HB CA 92646\n`
  s += `\n`

  return s
}

function buildTestReceiptMarkup(variation: 1 | 2 | 3): string {
  const single = buildSingleTestReceipt(variation)
  return single + `[cut: feed; partial]\n` + single + `[cut: feed; partial]\n`
}

function buildDiagnosticReceipt(): string {
  // Prints one sheet sampling many [mag] combinations so we can see what
  // this printer actually supports. Each line labels its own size.
  const combos: Array<[number, number]> = [
    [1, 1],
    [2, 1], [1, 2], [2, 2],
    [3, 1], [1, 3], [3, 2], [2, 3], [3, 3],
    [4, 1], [1, 4], [4, 2], [2, 4], [4, 4],
    [5, 2], [6, 2], [6, 6],
  ]

  let s = ''
  s += `[align: center]\n`
  s += `== SIZE DIAGNOSTIC ==\n`
  s += `\n`
  s += `[align: left]\n`
  for (const [w, h] of combos) {
    const label = `w${w} h${h}: Aa1`
    s += `${mag(w, h, label)}\n`
  }
  s += `\n`
  s += `[align: center]\n`
  s += `== end ==\n`
  s += `\n`
  s += `[cut: feed; partial]\n`
  return s
}

