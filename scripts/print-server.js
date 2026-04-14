const net = require('net')
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const PRINTER_IP = '192.168.1.78'
const PRINTER_PORT = 9100
const POLL_INTERVAL = 5000 // 5 seconds

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
)

// ESC/POS command bytes
const ESC = Buffer.from([0x1b])
const GS = Buffer.from([0x1d])
const INIT = Buffer.concat([ESC, Buffer.from('@')])
const CENTER = Buffer.concat([ESC, Buffer.from('a'), Buffer.from([0x01])])
const LEFT = Buffer.concat([ESC, Buffer.from('a'), Buffer.from([0x00])])
const BOLD_ON = Buffer.concat([ESC, Buffer.from('E'), Buffer.from([0x01])])
const BOLD_OFF = Buffer.concat([ESC, Buffer.from('E'), Buffer.from([0x00])])
const DOUBLE = Buffer.concat([ESC, Buffer.from('!'), Buffer.from([0x30])])
const DOUBLE_H = Buffer.concat([ESC, Buffer.from('!'), Buffer.from([0x10])])
const NORMAL = Buffer.concat([ESC, Buffer.from('!'), Buffer.from([0x00])])
const CUT = Buffer.concat([GS, Buffer.from('V'), Buffer.from([0x41, 0x03])])

function padRight(str, len) {
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length)
}

function padLeft(str, len) {
  return str.length >= len ? str : ' '.repeat(len - str.length) + str
}

function formatLine(left, right, width = 32) {
  const rightLen = right.length
  const leftMax = width - rightLen - 1
  return padRight(left.substring(0, leftMax), leftMax) + ' ' + right
}

function buildReceipt(order, items, mods, ings) {
  const parts = []

  parts.push(INIT)
  parts.push(CENTER)
  parts.push(DOUBLE)
  parts.push(Buffer.from('TACOS MIRANDA\n'))
  parts.push(NORMAL)
  parts.push(Buffer.from('\n'))

  parts.push(DOUBLE_H)
  parts.push(BOLD_ON)
  parts.push(Buffer.from(`ORDER ${order.order_number}\n`))
  parts.push(BOLD_OFF)
  parts.push(NORMAL)
  parts.push(Buffer.from('\n'))

  parts.push(LEFT)
  parts.push(BOLD_ON)
  parts.push(Buffer.from(`${order.customer_name || 'Guest'}\n`))
  parts.push(BOLD_OFF)
  if (order.customer_phone) {
    parts.push(Buffer.from(`${order.customer_phone}\n`))
  }

  const date = new Date(order.created_at).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
  parts.push(Buffer.from(`${date}\n`))
  parts.push(Buffer.from('\n'))
  parts.push(Buffer.from('================================\n'))

  for (const item of items) {
    const itemMods = mods.filter(m => m.order_item_id === item.id)
    const itemIngs = ings.filter(i => i.order_item_id === item.id)
    const removed = itemIngs.filter(i => i.action === 'remove')
    const extras = itemIngs.filter(i => i.action === 'extra')

    parts.push(Buffer.from('\n'))
    parts.push(BOLD_ON)
    const itemLine = formatLine(
      `${item.quantity}x ${item.item_name}`,
      `$${Number(item.line_total).toFixed(2)}`
    )
    parts.push(Buffer.from(itemLine + '\n'))
    parts.push(BOLD_OFF)

    if (itemMods.length > 0) {
      parts.push(Buffer.from(`   ${itemMods.map(m => m.modifier_name).join(', ')}\n`))
    }

    if (removed.length > 0) {
      parts.push(Buffer.from(`   ${removed.map(i => 'NO ' + i.ingredient_name).join(', ')}\n`))
    }

    if (extras.length > 0) {
      for (const e of extras) {
        const charge = Number(e.extra_charge) > 0 ? ` (+$${Number(e.extra_charge).toFixed(2)})` : ''
        parts.push(Buffer.from(`   EXTRA ${e.ingredient_name}${charge}\n`))
      }
    }

    if (item.special_instructions) {
      parts.push(Buffer.from(`   ** ${item.special_instructions}\n`))
    }
  }

  parts.push(Buffer.from('\n'))
  parts.push(Buffer.from('================================\n'))
  parts.push(Buffer.from(formatLine('Subtotal', `$${Number(order.subtotal).toFixed(2)}`) + '\n'))
  parts.push(Buffer.from(formatLine('Tax', `$${Number(order.tax).toFixed(2)}`) + '\n'))
  parts.push(BOLD_ON)
  parts.push(DOUBLE_H)
  parts.push(Buffer.from(formatLine('TOTAL', `$${Number(order.total).toFixed(2)}`) + '\n'))
  parts.push(NORMAL)
  parts.push(BOLD_OFF)

  if (order.special_instructions) {
    parts.push(Buffer.from('\n'))
    parts.push(BOLD_ON)
    parts.push(Buffer.from('NOTES:\n'))
    parts.push(BOLD_OFF)
    parts.push(Buffer.from(`${order.special_instructions}\n`))
  }

  parts.push(Buffer.from('\n'))
  parts.push(CENTER)
  parts.push(Buffer.from('(657) 845-4011\n'))
  parts.push(Buffer.from('21582 Brookhurst St\n'))
  parts.push(Buffer.from('Huntington Beach, CA 92646\n'))
  parts.push(Buffer.from('\n\n'))
  parts.push(CUT)

  return Buffer.concat(parts)
}

function sendToPrinter(data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    client.connect(PRINTER_PORT, PRINTER_IP, () => {
      client.write(data, () => {
        client.end()
        resolve()
      })
    })
    client.on('error', reject)
    client.setTimeout(10000)
    client.on('timeout', () => {
      client.destroy()
      reject(new Error('Printer connection timeout'))
    })
  })
}

async function checkAndPrint() {
  try {
    // Find oldest unprinted order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('printed', false)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (orderErr || !order) return // No orders to print

    console.log(`\nFound order: ${order.order_number}`)

    // Fetch items
    const { data: items } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', order.id)
      .order('sort_order')

    if (!items || items.length === 0) {
      console.log('  No items found, skipping')
      return
    }

    const itemIds = items.map(i => i.id)

    // Fetch mods and ingredients
    const [modsRes, ingsRes] = await Promise.all([
      supabase.from('order_item_modifiers').select('*').in('order_item_id', itemIds),
      supabase.from('order_item_ingredients').select('*').in('order_item_id', itemIds),
    ])

    const receipt = buildReceipt(order, items, modsRes.data || [], ingsRes.data || [])

    // Print
    await sendToPrinter(receipt)
    console.log(`  PRINTED: ${order.order_number} - $${Number(order.total).toFixed(2)}`)

    // Mark as printed
    await supabase
      .from('orders')
      .update({ printed: true, status: 'confirmed' })
      .eq('id', order.id)

    console.log('  Marked as printed')

  } catch (err) {
    console.error('Error:', err.message)
  }
}

// Start polling
console.log('Tacos Miranda Print Server')
console.log(`Printer: ${PRINTER_IP}:${PRINTER_PORT}`)
console.log(`Polling every ${POLL_INTERVAL / 1000}s`)
console.log('Waiting for orders...\n')

setInterval(checkAndPrint, POLL_INTERVAL)
checkAndPrint() // Check immediately on start
