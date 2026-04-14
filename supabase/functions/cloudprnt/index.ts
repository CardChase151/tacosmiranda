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
      const { data: order } = await supabase
        .from('orders')
        .select('id, order_number')
        .eq('printed', false)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (order) {
        return new Response(JSON.stringify({
          jobReady: true,
          mediaTypes: ['text/vnd.star.markup'],
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

      const { data: items } = await supabase
        .from('order_items').select('*').eq('order_id', order.id).order('sort_order')

      const itemIds = (items || []).map((i: any) => i.id)
      const [modsRes, ingsRes] = await Promise.all([
        supabase.from('order_item_modifiers').select('*').in('order_item_id', itemIds),
        supabase.from('order_item_ingredients').select('*').in('order_item_id', itemIds),
      ])

      const mods = modsRes.data || []
      const ings = ingsRes.data || []

      const orderDate = new Date(order.created_at).toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })

      let r = ''
      r += '[align: center]\n'
      r += '[mag: w 2; h 2]TACOS MIRANDA[mag]\n\n'
      r += '[mag: w 2; h 1]ORDER ' + order.order_number + '[mag]\n\n'
      r += '[align: left]\n'
      r += '[bold: on]' + (order.customer_name || 'Guest') + '[bold: off]\n'
      if (order.customer_phone) r += order.customer_phone + '\n'
      r += orderDate + '\n\n'
      r += '--------------------------------\n'

      for (const item of (items || [])) {
        const itemMods = mods.filter((m: any) => m.order_item_id === item.id)
        const itemIngs = ings.filter((i: any) => i.order_item_id === item.id)
        const removed = itemIngs.filter((i: any) => i.action === 'remove')
        const extras = itemIngs.filter((i: any) => i.action === 'extra')

        r += '\n[bold: on][column: left: ' + item.quantity + 'x ' + item.item_name + '; right: $' + Number(item.line_total).toFixed(2) + '][bold: off]\n'
        if (itemMods.length > 0) r += '  ' + itemMods.map((m: any) => m.modifier_name).join(', ') + '\n'
        if (removed.length > 0) r += '  ' + removed.map((i: any) => 'NO ' + i.ingredient_name).join(', ') + '\n'
        for (const e of extras) {
          const charge = Number(e.extra_charge) > 0 ? ' (+$' + Number(e.extra_charge).toFixed(2) + ')' : ''
          r += '  EXTRA ' + e.ingredient_name + charge + '\n'
        }
        if (item.special_instructions) r += '  ** ' + item.special_instructions + '\n'
      }

      r += '\n--------------------------------\n'
      r += '[column: left: Subtotal; right: $' + Number(order.subtotal).toFixed(2) + ']\n'
      r += '[column: left: Tax; right: $' + Number(order.tax).toFixed(2) + ']\n'
      r += '[bold: on][mag: w 1; h 2][column: left: TOTAL; right: $' + Number(order.total).toFixed(2) + '][mag][bold: off]\n'

      if (order.special_instructions) {
        r += '\n[bold: on]NOTES:[bold: off]\n' + order.special_instructions + '\n'
      }

      r += '\n[align: center]\n(657) 845-4011\n21582 Brookhurst St, HB CA 92646\n\n\n[cut: feed; partial]\n'

      return new Response(r, {
        headers: { ...headers, 'Content-Type': 'text/vnd.star.markup' },
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
      await supabase.from('orders').update({ printed: true, status: 'confirmed' }).eq('id', jobToken)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }

  return new Response('Method not allowed', { status: 405, headers })
})
