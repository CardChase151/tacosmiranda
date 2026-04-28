import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const TAX_RATE = 0.0775
const PLATFORM_FEE_PERCENT = 0.01 // 1%

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type CartItem = {
  menu_item_id: string
  item_name: string
  quantity: number
  modifiers?: { modifier_id: string; modifier_name: string; price_delta: number }[]
  ingredients?: { ingredient_id?: string; ingredient_name: string; action: 'remove' | 'extra'; extra_charge?: number }[]
  special_instructions?: string
}

function round2(n: number) { return Math.round(n * 100) / 100 }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })

    const body = await req.json()
    const {
      items,
      customer_name,
      customer_phone,
      customer_email,
      user_id,
      special_instructions,
      success_url,
      cancel_url,
    }: {
      items: CartItem[]
      customer_name: string
      customer_phone?: string
      customer_email?: string
      user_id?: string
      special_instructions?: string
      success_url?: string
      cancel_url?: string
    } = body

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: 'Cart is empty' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { data: settings } = await supabase
      .from('stripe_settings')
      .select('*')
      .eq('id', 'main')
      .maybeSingle()

    if (!settings?.stripe_account_id || !settings?.charges_enabled) {
      return new Response(JSON.stringify({ error: 'Restaurant has not completed Stripe onboarding yet' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Validate each item server-side: pull price from menu_items, apply modifiers + ingredient extras
    const menuIds = items.map(i => i.menu_item_id)
    const { data: menuRows } = await supabase.from('menu_items').select('id, name, price').in('id', menuIds)
    const byId = new Map(menuRows?.map(m => [m.id, m]) || [])

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
    const orderItemsToInsert: any[] = []
    let subtotal = 0

    for (const ci of items) {
      const menu = byId.get(ci.menu_item_id)
      if (!menu) throw new Error(`Unknown menu item: ${ci.menu_item_id}`)

      let lineUnit = Number(menu.price)
      for (const m of ci.modifiers || []) lineUnit += Number(m.price_delta || 0)
      for (const g of ci.ingredients || []) if (g.action === 'extra') lineUnit += Number(g.extra_charge || 0)
      const lineTotal = round2(lineUnit * ci.quantity)
      subtotal = round2(subtotal + lineTotal)

      const modsLabel = (ci.modifiers || []).map(m => m.modifier_name).join(', ')
      const removedLabel = (ci.ingredients || []).filter(i => i.action === 'remove').map(i => 'NO ' + i.ingredient_name).join(', ')
      const extraLabel = (ci.ingredients || []).filter(i => i.action === 'extra').map(i => 'EXTRA ' + i.ingredient_name).join(', ')
      const descParts = [modsLabel, removedLabel, extraLabel, ci.special_instructions].filter(Boolean)

      lineItems.push({
        quantity: ci.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(lineUnit * 100),
          product_data: {
            name: menu.name,
            description: descParts.join(' | ') || undefined,
          },
        },
      })

      orderItemsToInsert.push({
        _cart: ci,
        item_name: menu.name,
        quantity: ci.quantity,
        unit_price: lineUnit,
        line_total: lineTotal,
      })
    }

    const tax = round2(subtotal * TAX_RATE)
    const total = round2(subtotal + tax)
    const totalCents = Math.round(total * 100)
    const applicationFeeCents = Math.max(0, Math.round(totalCents * PLATFORM_FEE_PERCENT))

    // Tax as separate line item so Checkout shows it
    if (tax > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(tax * 100),
          product_data: { name: `Tax (${(TAX_RATE * 100).toFixed(2)}%)` },
        },
      })
    }

    // Generate order number and create a pre-payment order record
    const orderNumber = 'TM-' + Date.now().toString().slice(-6)
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_name,
        customer_phone,
        customer_email: customer_email?.toLowerCase() || null,
        user_id: user_id || null,
        subtotal,
        tax,
        total,
        status: 'awaiting_payment',
        printed: false,
        special_instructions,
      })
      .select()
      .single()
    if (orderErr) throw orderErr

    for (const oi of orderItemsToInsert) {
      const { data: insertedItem } = await supabase
        .from('order_items')
        .insert({
          order_id: order.id,
          item_name: oi.item_name,
          quantity: oi.quantity,
          unit_price: oi.unit_price,
          line_total: oi.line_total,
          special_instructions: oi._cart.special_instructions,
        })
        .select()
        .single()
      if (insertedItem) {
        for (const m of oi._cart.modifiers || []) {
          await supabase.from('order_item_modifiers').insert({
            order_item_id: insertedItem.id,
            modifier_id: m.modifier_id,
            modifier_name: m.modifier_name,
            upcharge: m.price_delta || 0,
          })
        }
        for (const g of oi._cart.ingredients || []) {
          await supabase.from('order_item_ingredients').insert({
            order_item_id: insertedItem.id,
            ingredient_id: g.ingredient_id || null,
            ingredient_name: g.ingredient_name,
            action: g.action,
            extra_charge: g.extra_charge || 0,
          })
        }
      }
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: lineItems,
        customer_email: customer_email || undefined,
        success_url: success_url || `https://tacosmiranda.com/my-orders?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancel_url || 'https://tacosmiranda.com/order?cancelled=true',
        payment_intent_data: {
          application_fee_amount: applicationFeeCents,
          metadata: { order_id: order.id, order_number: orderNumber },
        },
        metadata: { order_id: order.id, order_number: orderNumber },
      },
      { stripeAccount: settings.stripe_account_id },
    )

    await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id)

    return new Response(
      JSON.stringify({ url: session.url, order_id: order.id, order_number: orderNumber }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[stripe-checkout]', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
