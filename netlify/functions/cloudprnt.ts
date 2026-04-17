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
