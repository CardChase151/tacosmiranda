// Test-print three font-size variations of the online-order receipt.
// Each variation prints TWO copies (cut between) so we can pick a final size.
// Runs raw ESC/POS over TCP -> bypasses Stripe, Supabase, orders table, everything.
//
// Usage:
//   node scripts/test-print-receipts.js 1      // just V1 (2 copies)
//   node scripts/test-print-receipts.js 2      // just V2 (2 copies)
//   node scripts/test-print-receipts.js 3      // just V3 (2 copies)
//   node scripts/test-print-receipts.js all    // V1 + V2 + V3 (6 copies)

const net = require('net')

const PRINTER_IP = '192.168.1.78'
const PRINTER_PORT = 9100

// ── ESC/POS command builders ──
const ESC = 0x1b
const GS = 0x1d
const buf = (...bytes) => Buffer.from(bytes)
const text = (s) => Buffer.from(s)

const INIT = buf(ESC, 0x40)
const CENTER = buf(ESC, 0x61, 0x01)
const LEFT = buf(ESC, 0x61, 0x00)
const BOLD_ON = buf(ESC, 0x45, 0x01)
const BOLD_OFF = buf(ESC, 0x45, 0x00)
// GS ! n : character size, width = high nibble + 1, height = low nibble + 1
const SIZE = (w, h) => buf(GS, 0x21, ((w - 1) << 4) | (h - 1))
const NORMAL = SIZE(1, 1)
// GS V m n : partial cut with feed
const CUT = buf(GS, 0x56, 0x42, 0x03)

// ── Variations: header stays 2x wide so "TACOS MIRANDA" fits on 58mm paper ──
const VARIATIONS = [
  {
    label: 'VARIATION 1  (slightly bigger)',
    header: { w: 2, h: 2 },
    orderNum: { w: 2, h: 2 },
    body: { w: 1, h: 2 },
    total: { w: 2, h: 2 },
    cols: 32,
  },
  {
    label: 'VARIATION 2  (noticeably bigger)',
    header: { w: 2, h: 3 },
    orderNum: { w: 2, h: 2 },
    body: { w: 2, h: 2 },
    total: { w: 2, h: 3 },
    cols: 16,
  },
  {
    label: 'VARIATION 3  (largest)',
    header: { w: 2, h: 3 },
    orderNum: { w: 2, h: 3 },
    body: { w: 2, h: 3 },
    total: { w: 2, h: 4 },
    cols: 16,
  },
]

// ── Sample order for the test receipt ──
const SAMPLE = {
  orderNumber: 'TEST',
  customerName: 'Test Customer',
  customerPhone: '(714) 555-1234',
  dateLabel: 'Today, 2:45 PM',
  items: [
    {
      qty: 2,
      name: 'Carne Asada Tacos',
      price: 15.00,
      mods: ['add cheese', 'sour cream'],
      removed: ['onions'],
      extras: [],
      special: null,
    },
    {
      qty: 1,
      name: 'California Burrito',
      price: 14.99,
      mods: [],
      removed: [],
      extras: [{ name: 'guacamole', charge: 1.50 }],
      special: null,
    },
    {
      qty: 1,
      name: 'Horchata',
      price: 3.50,
      mods: [],
      removed: [],
      extras: [],
      special: 'large please',
    },
  ],
  subtotal: 33.49,
  tax: 2.93,
  total: 36.42,
}

function padLeft(s, len) {
  return s.length >= len ? s : ' '.repeat(len - s.length) + s
}

function formatLine(left, right, width) {
  const rightLen = right.length
  const leftMax = Math.max(0, width - rightLen - 1)
  const leftClipped = left.length > leftMax ? left.substring(0, leftMax) : left
  const gap = width - leftClipped.length - rightLen
  return leftClipped + ' '.repeat(Math.max(1, gap)) + right
}

function buildReceipt(v) {
  const parts = []
  const cols = v.cols

  parts.push(INIT)

  // Variation marker (small, so it's obvious which one this is)
  parts.push(CENTER)
  parts.push(NORMAL)
  parts.push(text(`-- ${v.label} --\n`))
  parts.push(text('\n'))

  // Header
  parts.push(SIZE(v.header.w, v.header.h))
  parts.push(BOLD_ON)
  parts.push(text('TACOS MIRANDA\n'))
  parts.push(BOLD_OFF)
  parts.push(NORMAL)
  parts.push(text('\n'))

  // Order number
  parts.push(SIZE(v.orderNum.w, v.orderNum.h))
  parts.push(BOLD_ON)
  parts.push(text(`ORDER ${SAMPLE.orderNumber}\n`))
  parts.push(BOLD_OFF)
  parts.push(NORMAL)
  parts.push(text('\n'))

  // Customer block
  parts.push(LEFT)
  parts.push(SIZE(v.body.w, v.body.h))
  parts.push(BOLD_ON)
  parts.push(text(`${SAMPLE.customerName}\n`))
  parts.push(BOLD_OFF)
  parts.push(text(`${SAMPLE.customerPhone}\n`))
  parts.push(text(`${SAMPLE.dateLabel}\n`))
  parts.push(text('\n'))
  parts.push(text('-'.repeat(cols) + '\n'))

  // Items
  for (const item of SAMPLE.items) {
    parts.push(text('\n'))
    parts.push(BOLD_ON)
    if (cols >= 28) {
      parts.push(text(formatLine(`${item.qty}x ${item.name}`, `$${item.price.toFixed(2)}`, cols) + '\n'))
    } else {
      // Two-line item layout for narrower (bigger font) variations
      parts.push(text(`${item.qty}x ${item.name}\n`))
      parts.push(text(padLeft(`$${item.price.toFixed(2)}`, cols) + '\n'))
    }
    parts.push(BOLD_OFF)

    if (item.mods.length) parts.push(text(`  ${item.mods.join(', ')}\n`))
    if (item.removed.length) parts.push(text(`  ${item.removed.map((x) => 'NO ' + x).join(', ')}\n`))
    for (const e of item.extras) {
      const charge = e.charge > 0 ? ` (+$${e.charge.toFixed(2)})` : ''
      parts.push(text(`  EXTRA ${e.name}${charge}\n`))
    }
    if (item.special) parts.push(text(`  ** ${item.special}\n`))
  }

  parts.push(text('\n'))
  parts.push(text('-'.repeat(cols) + '\n'))
  parts.push(text(formatLine('Subtotal', `$${SAMPLE.subtotal.toFixed(2)}`, cols) + '\n'))
  parts.push(text(formatLine('Tax', `$${SAMPLE.tax.toFixed(2)}`, cols) + '\n'))

  // Total
  parts.push(SIZE(v.total.w, v.total.h))
  parts.push(BOLD_ON)
  parts.push(text(`TOTAL  $${SAMPLE.total.toFixed(2)}\n`))
  parts.push(BOLD_OFF)
  parts.push(NORMAL)

  parts.push(text('\n'))
  parts.push(CENTER)
  parts.push(text('(657) 845-4011\n'))
  parts.push(text('21582 Brookhurst St\n'))
  parts.push(text('HB CA 92646\n'))
  parts.push(text('\n\n'))

  return Buffer.concat(parts)
}

function buildPairedJob(variationIndex) {
  const v = VARIATIONS[variationIndex]
  const single = buildReceipt(v)
  // Two copies, cut after each
  return Buffer.concat([single, CUT, single, CUT])
}

function sendToPrinter(data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    let settled = false
    const done = (err) => {
      if (settled) return
      settled = true
      err ? reject(err) : resolve()
    }
    client.setTimeout(10000)
    client.on('error', done)
    client.on('timeout', () => {
      client.destroy()
      done(new Error('Printer connection timeout'))
    })
    client.connect(PRINTER_PORT, PRINTER_IP, () => {
      client.write(data, () => {
        client.end()
        done()
      })
    })
  })
}

async function main() {
  const arg = (process.argv[2] || '').toLowerCase()
  const valid = ['1', '2', '3', 'all']
  if (!valid.includes(arg)) {
    console.log('Usage: node scripts/test-print-receipts.js <1|2|3|all>')
    console.log('  1   = ' + VARIATIONS[0].label + '   (prints 2 copies)')
    console.log('  2   = ' + VARIATIONS[1].label + '   (prints 2 copies)')
    console.log('  3   = ' + VARIATIONS[2].label + '   (prints 2 copies)')
    console.log('  all = print all three (6 receipts total, in order)')
    process.exit(1)
  }

  const indexes = arg === 'all' ? [0, 1, 2] : [parseInt(arg, 10) - 1]
  for (const i of indexes) {
    console.log(`\nSending ${VARIATIONS[i].label} - 2 copies...`)
    await sendToPrinter(buildPairedJob(i))
    console.log('  sent')
    if (i < indexes[indexes.length - 1]) {
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  console.log('\nDone.')
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
