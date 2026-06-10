// Insert 3 test orders into Supabase that the Star CloudPRNT printer will
// pick up and print at different font-size variations. Each test order prints
// TWO copies (cut between) so we can compare side-by-side.
//
// Detection is server-side: cloudprnt.ts checks special_instructions for
// "__TEST_RECEIPT_V<n>__" and emits the variation markup instead of a real
// receipt build.
//
// Usage:
//   node scripts/insert-test-orders.js          // insert V1, V2, V3 (6 receipts)
//   node scripts/insert-test-orders.js 2        // insert only V2 (2 receipts)
//   node scripts/insert-test-orders.js cleanup  // delete any leftover test orders

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
)

const TEST_CUSTOMER = '[TEST PRINT]'

async function insertVariation(n) {
  const orderNumber = `TST${n}-${Date.now().toString().slice(-4)}`
  const { data, error } = await supabase
    .from('orders')
    .insert({
      order_number: orderNumber,
      user_id: null,
      customer_name: TEST_CUSTOMER,
      customer_email: 'test@example.com',
      customer_phone: '(714) 555-1234',
      status: 'pending',
      printed: false,
      subtotal: 33.49,
      tax: 2.93,
      total: 36.42,
      special_instructions: `__TEST_RECEIPT_V${n}__`,
    })
    .select('id, order_number')
    .single()

  if (error) throw new Error(`Insert V${n} failed: ${error.message}`)
  console.log(`  V${n} queued: order ${data.order_number} (id ${data.id})`)
}

async function cleanup() {
  const { data, error } = await supabase
    .from('orders')
    .delete()
    .eq('customer_name', TEST_CUSTOMER)
    .select('id, order_number')

  if (error) throw new Error(`Cleanup failed: ${error.message}`)
  console.log(`Deleted ${data?.length || 0} leftover test order(s).`)
}

async function main() {
  const arg = (process.argv[2] || '').toLowerCase()

  if (arg === 'cleanup') {
    await cleanup()
    return
  }

  if (arg === 'diag') {
    const orderNumber = `DIAG-${Date.now().toString().slice(-4)}`
    const { data, error } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        user_id: null,
        customer_name: TEST_CUSTOMER,
        customer_email: 'test@example.com',
        customer_phone: '(714) 555-1234',
        status: 'pending',
        printed: false,
        subtotal: 0,
        tax: 0,
        total: 0,
        special_instructions: `__TEST_DIAGNOSTIC__`,
      })
      .select('id, order_number')
      .single()

    if (error) throw new Error(`Diag insert failed: ${error.message}`)
    console.log(`Diagnostic queued: order ${data.order_number} (id ${data.id})`)
    console.log('Printer will print one sheet showing many size combinations.')
    return
  }

  const which = arg ? [parseInt(arg, 10)] : [1, 2, 3]
  if (which.some((n) => ![1, 2, 3].includes(n))) {
    console.log('Usage: node scripts/insert-test-orders.js [1|2|3|cleanup]')
    console.log('  (no arg)  insert all 3 variations -> 6 receipts in 3 pairs')
    console.log('  1|2|3     insert just that variation -> 2 receipts')
    console.log('  cleanup   delete any leftover test orders from prior runs')
    process.exit(1)
  }

  console.log(`Inserting ${which.length} test order(s) for printer to pick up...`)
  for (const n of which) {
    await insertVariation(n)
  }
  console.log('\nDone. The printer should pull each order on its next poll and')
  console.log('print 2 copies for each variation. Run with "cleanup" later to')
  console.log('remove the test orders from the admin dashboard.')
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
