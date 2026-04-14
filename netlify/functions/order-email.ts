import type { Handler } from '@netlify/functions'

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const { order, items } = JSON.parse(event.body || '{}')

  if (!order || !items) {
    return { statusCode: 400, body: 'Missing order data' }
  }

  const TO_EMAIL = 'TheK2way17@gmail.com'

  // Build item rows
  const itemRows = items.map((item: any) => {
    const mods = item.modifiers?.length
      ? `<br/><span style="color:#C8A84E;font-size:13px;">${item.modifiers.map((m: any) => m.modifier_name + (m.upcharge > 0 ? ` (+$${m.upcharge.toFixed(2)})` : '')).join(', ')}</span>`
      : ''
    const removed = (item.ingredients || []).filter((i: any) => i.action === 'remove')
    const extras = (item.ingredients || []).filter((i: any) => i.action === 'extra')
    const removedHtml = removed.length
      ? `<br/><span style="color:#aa6666;font-size:12px;">NO ${removed.map((i: any) => i.ingredient_name).join(', NO ')}</span>`
      : ''
    const extrasHtml = extras.length
      ? `<br/><span style="color:#66aa66;font-size:12px;">${extras.map((i: any) => `EXTRA ${i.ingredient_name}` + (i.extra_charge > 0 ? ` (+$${i.extra_charge.toFixed(2)})` : '')).join(', ')}</span>`
      : ''
    const instructions = item.special_instructions
      ? `<br/><span style="color:#888;font-size:12px;font-style:italic;">${item.special_instructions}</span>`
      : ''
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #333;">
          ${item.item_name} x${item.quantity}${mods}${removedHtml}${extrasHtml}${instructions}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #333;text-align:right;">$${item.line_total.toFixed(2)}</td>
      </tr>
    `
  }).join('')

  const html = `
    <div style="max-width:500px;margin:0 auto;font-family:Arial,sans-serif;background:#1a1a1a;color:#fff;padding:24px;border-radius:8px;">
      <h1 style="color:#C8A84E;font-size:24px;margin:0 0 4px;">New Order: ${order.order_number}</h1>
      <p style="color:#888;margin:0 0 20px;font-size:14px;">${new Date(order.created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}</p>

      <div style="background:#222;border-radius:8px;padding:12px;margin-bottom:16px;">
        <p style="margin:0;font-size:14px;"><strong>Customer:</strong> ${order.customer_name || 'N/A'}</p>
        <p style="margin:4px 0 0;font-size:14px;"><strong>Phone:</strong> ${order.customer_phone || 'N/A'}</p>
        <p style="margin:4px 0 0;font-size:14px;"><strong>Email:</strong> ${order.customer_email || 'N/A'}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead>
          <tr style="border-bottom:2px solid #C8A84E;">
            <th style="padding:8px 12px;text-align:left;color:#C8A84E;font-size:13px;">Item</th>
            <th style="padding:8px 12px;text-align:right;color:#C8A84E;font-size:13px;">Price</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div style="border-top:2px solid #C8A84E;padding-top:12px;">
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px;">
          <span>Subtotal</span><span>$${order.subtotal.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px;">
          <span>Tax</span><span>$${order.tax.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold;color:#C8A84E;margin-top:8px;">
          <span>Total</span><span>$${order.total.toFixed(2)}</span>
        </div>
      </div>

      ${order.special_instructions ? `
        <div style="margin-top:16px;background:#222;border-radius:8px;padding:12px;">
          <p style="margin:0;font-size:13px;color:#C8A84E;font-weight:bold;">Special Instructions:</p>
          <p style="margin:4px 0 0;font-size:14px;">${order.special_instructions}</p>
        </div>
      ` : ''}
    </div>
  `

  // Use Resend or similar - for now use a simple fetch to a mail API
  // Since this is testing, we'll try the Supabase built-in or just log
  try {
    const RESEND_KEY = process.env.RESEND_API_KEY
    if (RESEND_KEY) {
      // 1. Send to restaurant
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Tacos Miranda <orders@mysendz.com>',
          to: [TO_EMAIL],
          subject: `New Order ${order.order_number} - $${order.total.toFixed(2)}`,
          html,
        }),
      })
      const data = await res.json()
      console.log('Restaurant email sent:', data)

      // 2. Send confirmation to customer
      if (order.customer_email) {
        const customerHtml = `
          <div style="max-width:500px;margin:0 auto;font-family:Arial,sans-serif;background:#000;color:#fff;border-radius:8px;overflow:hidden;">
            <div style="padding:32px 24px 20px;text-align:center;">
              <h1 style="color:#fff;font-size:24px;margin:0 0 4px;letter-spacing:3px;">TACOS MIRANDA</h1>
              <div style="width:40px;height:1px;background:#C8A84E;margin:10px auto;"></div>
              <p style="color:#C8A84E;font-size:11px;margin:0;letter-spacing:2px;text-transform:uppercase;">Order Confirmation</p>
            </div>

            <div style="padding:0 24px 24px;">
              <div style="background:#111;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px;">
                <p style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;">Order Number</p>
                <p style="color:#C8A84E;font-size:32px;font-weight:700;letter-spacing:3px;margin:0;">${order.order_number}</p>
              </div>

              <p style="color:#fff;font-size:16px;margin:0 0 4px;">Thank you, ${order.customer_name || 'Guest'}!</p>
              <p style="color:#888;font-size:14px;margin:0 0 20px;">Your order has been received.</p>

              <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                <thead>
                  <tr style="border-bottom:2px solid #C8A84E;">
                    <th style="padding:8px 0;text-align:left;color:#C8A84E;font-size:12px;">Item</th>
                    <th style="padding:8px 0;text-align:right;color:#C8A84E;font-size:12px;">Price</th>
                  </tr>
                </thead>
                <tbody>${itemRows}</tbody>
              </table>

              <div style="border-top:2px solid #C8A84E;padding-top:12px;">
                <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px;">
                  <span style="color:#888;">Subtotal</span><span>$${order.subtotal.toFixed(2)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px;">
                  <span style="color:#888;">Tax</span><span>$${order.tax.toFixed(2)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold;color:#C8A84E;margin-top:8px;">
                  <span>Total</span><span>$${order.total.toFixed(2)}</span>
                </div>
              </div>

              <div style="margin-top:24px;background:#111;border-radius:8px;padding:16px;text-align:center;">
                <p style="color:#fff;font-size:13px;margin:0 0 4px;font-weight:600;">21582 Brookhurst St, Huntington Beach, CA 92646</p>
                <p style="color:#C8A84E;font-size:13px;margin:0;font-weight:600;">(657) 845-4011</p>
              </div>
            </div>

            <div style="border-top:1px solid #1a1a1a;padding:16px 24px;text-align:center;">
              <p style="color:#374151;font-size:10px;margin:0;">Tacos Miranda &copy; ${new Date().getFullYear()}</p>
            </div>
          </div>
        `

        const custRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Tacos Miranda <orders@mysendz.com>',
            to: [order.customer_email],
            subject: `Order Confirmed - ${order.order_number}`,
            html: customerHtml,
          }),
        })
        const custData = await custRes.json()
        console.log('Customer email sent:', custData)
      }
    } else {
      console.log('No RESEND_API_KEY set, logging order email:')
      console.log(`To: ${TO_EMAIL}`)
      console.log(`Subject: New Order ${order.order_number}`)
      console.log(`Items: ${items.length}`)
      console.log(`Total: $${order.total.toFixed(2)}`)
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    }
  } catch (err: any) {
    console.error('Email error:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    }
  }
}

export { handler }
