import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
const siteUrl = Deno.env.get('SITE_URL') || 'https://tacosmiranda.com'
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function sendOrderEmail(orderId: string, fallbackEmail: string | null) {
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()
  if (!order) {
    console.warn(`[stripe-webhook] sendOrderEmail: order ${orderId} not found`)
    return
  }
  if (!order.customer_email && fallbackEmail) {
    await supabase.from('orders').update({ customer_email: fallbackEmail }).eq('id', orderId)
    order.customer_email = fallbackEmail
  }

  const { data: items } = await supabase
    .from('order_items')
    .select('id, item_name, quantity, unit_price, line_total, special_instructions')
    .eq('order_id', orderId)
    .order('created_at')
  const itemIds = (items || []).map(i => i.id)

  const [{ data: mods }, { data: ings }] = await Promise.all([
    supabase
      .from('order_item_modifiers')
      .select('order_item_id, modifier_name, upcharge')
      .in('order_item_id', itemIds.length ? itemIds : ['00000000-0000-0000-0000-000000000000']),
    supabase
      .from('order_item_ingredients')
      .select('order_item_id, ingredient_name, action, extra_charge')
      .in('order_item_id', itemIds.length ? itemIds : ['00000000-0000-0000-0000-000000000000']),
  ])

  const itemsPayload = (items || []).map(it => ({
    item_name: it.item_name,
    quantity: it.quantity,
    unit_price: it.unit_price,
    line_total: it.line_total,
    special_instructions: it.special_instructions,
    modifiers: (mods || []).filter(m => m.order_item_id === it.id),
    ingredients: (ings || []).filter(g => g.order_item_id === it.id),
  }))

  const res = await fetch(`${siteUrl}/.netlify/functions/order-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order, items: itemsPayload }),
  })
  if (!res.ok) {
    console.warn(`[stripe-webhook] order-email returned ${res.status}: ${await res.text()}`)
  } else {
    console.log(`[stripe-webhook] order-email sent for ${order.order_number}`)
  }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  if (!stripeKey || !webhookSecret) {
    return new Response(JSON.stringify({ error: 'Stripe secrets not configured' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })
  const sig = req.headers.get('stripe-signature')
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig || '', webhookSecret)
  } catch (err: any) {
    console.error('[stripe-webhook] bad signature:', err.message)
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  console.log(`[stripe-webhook] ${event.type} (account: ${event.account || 'platform'})`)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orderId = session.metadata?.order_id
        const paymentIntentId = session.payment_intent as string | null
        if (!orderId) break

        // Fetch payment intent for fee breakdown (on connected account)
        let stripeFee = 0
        let appFee = 0
        let netAmount = (session.amount_total || 0) / 100

        if (paymentIntentId && event.account) {
          try {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.balance_transaction'] }, { stripeAccount: event.account })
            const charge: any = pi.latest_charge
            if (charge?.balance_transaction) {
              stripeFee = charge.balance_transaction.fee / 100
              netAmount = charge.balance_transaction.net / 100
            }
            appFee = (pi.application_fee_amount || 0) / 100
          } catch (e: any) {
            console.warn('[stripe-webhook] Could not retrieve PI fee info:', e.message)
          }
        }

        await supabase
          .from('orders')
          .update({
            status: 'pending', // CloudPRNT printer picks up pending orders
            printed: false,
            stripe_payment_intent_id: paymentIntentId,
            stripe_fee_amount: stripeFee,
            application_fee_amount: appFee,
            net_amount: netAmount,
            paid_at: new Date().toISOString(),
          })
          .eq('id', orderId)

        console.log(`[stripe-webhook] order ${orderId} paid -> pending (printer will pick up)`)

        const stripeEmail =
          (session.customer_details?.email as string | undefined) ||
          (session.customer_email as string | null) ||
          null
        try {
          await sendOrderEmail(orderId, stripeEmail)
        } catch (e: any) {
          console.warn('[stripe-webhook] sendOrderEmail failed:', e.message)
        }
        break
      }

      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orderId = session.metadata?.order_id
        if (orderId) {
          await supabase.from('orders').update({ status: 'failed' }).eq('id', orderId)
        }
        break
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const { data: settings } = await supabase
          .from('stripe_settings').select('stripe_account_id').eq('id', 'main').maybeSingle()
        if (settings?.stripe_account_id === account.id) {
          await supabase
            .from('stripe_settings')
            .update({
              onboarding_complete: account.details_submitted,
              charges_enabled: account.charges_enabled,
              payouts_enabled: account.payouts_enabled,
              business_name:
                account.business_profile?.name ||
                account.settings?.dashboard?.display_name ||
                null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', 'main')
          console.log(`[stripe-webhook] stripe_settings synced: charges=${account.charges_enabled} payouts=${account.payouts_enabled}`)
        }
        break
      }

      default:
        console.log(`[stripe-webhook] unhandled event: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[stripe-webhook] handler error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
