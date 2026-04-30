import type { Handler } from '@netlify/functions'

const TO_EMAIL = 'TheK2way17@gmail.com'
const FROM = 'Tacos Miranda <orders@mysendz.com>'
const LOGO_URL = 'https://tacosmiranda.com/logo-white-transparent.png'
const RESTAURANT_ADDRESS = '21582 Brookhurst St, Huntington Beach, CA 92646'
const RESTAURANT_PHONE = '(657) 845-4011'
const PHONE_HREF = 'tel:6578454011'

const COLORS = {
  bg: '#0a0a0a',
  card: '#141414',
  cardAlt: '#1c1c1c',
  border: '#2a2a2a',
  borderAccent: '#C8A84E',
  text: '#ffffff',
  textDim: '#9a9a9a',
  textFaint: '#5a5a5a',
  gold: '#C8A84E',
  goldBright: '#E0C268',
  remove: '#d97a7a',
  extra: '#7ac084',
}

interface OrderItem {
  item_name: string
  quantity: number
  unit_price?: number
  line_total: number
  special_instructions?: string
  modifiers?: Array<{ modifier_name: string; upcharge?: number; price_delta?: number }>
  ingredients?: Array<{ ingredient_name: string; action: 'remove' | 'extra'; extra_charge?: number }>
}

interface OrderInfo {
  order_number: string
  customer_name?: string
  customer_email?: string
  customer_phone?: string
  subtotal: number
  tax: number
  total: number
  special_instructions?: string
  created_at?: string
  paid_at?: string
}

function escape(str: string | undefined | null): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(n: number | undefined | null): string {
  return `$${(Number(n) || 0).toFixed(2)}`
}

function formatTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function renderItemRow(item: OrderItem): string {
  const mods = (item.modifiers || []).map(m => {
    const up = (m.upcharge ?? m.price_delta ?? 0) as number
    return up > 0 ? `${escape(m.modifier_name)} (+${money(up)})` : escape(m.modifier_name)
  }).join(', ')

  const removed = (item.ingredients || []).filter(i => i.action === 'remove')
  const extras = (item.ingredients || []).filter(i => i.action === 'extra')

  const removedText = removed.length
    ? removed.map(i => `NO ${escape(i.ingredient_name)}`).join(', ')
    : ''
  const extrasText = extras.length
    ? extras.map(i => {
        const c = i.extra_charge || 0
        return c > 0
          ? `EXTRA ${escape(i.ingredient_name)} (+${money(c)})`
          : `EXTRA ${escape(i.ingredient_name)}`
      }).join(', ')
    : ''

  const detailLines = [
    mods && `<div style="color:${COLORS.gold};font-size:13px;line-height:1.5;margin-top:4px;">${mods}</div>`,
    removedText && `<div style="color:${COLORS.remove};font-size:12px;line-height:1.5;margin-top:2px;letter-spacing:0.3px;">${removedText}</div>`,
    extrasText && `<div style="color:${COLORS.extra};font-size:12px;line-height:1.5;margin-top:2px;letter-spacing:0.3px;">${extrasText}</div>`,
    item.special_instructions && `<div style="color:${COLORS.textDim};font-size:12px;line-height:1.5;margin-top:4px;font-style:italic;">"${escape(item.special_instructions)}"</div>`,
  ].filter(Boolean).join('')

  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid ${COLORS.border};vertical-align:top;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
          <tr>
            <td style="padding-right:12px;vertical-align:top;">
              <div style="color:${COLORS.text};font-size:15px;font-weight:600;line-height:1.3;">
                <span style="color:${COLORS.gold};font-weight:700;">${item.quantity}&times;</span>
                &nbsp;${escape(item.item_name)}
              </div>
              ${detailLines}
            </td>
            <td style="vertical-align:top;text-align:right;white-space:nowrap;">
              <div style="color:${COLORS.text};font-size:15px;font-weight:600;">${money(item.line_total)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `
}

function renderItemsTable(items: OrderItem[]): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">
      <tr>
        <td style="padding:0 0 8px;border-bottom:2px solid ${COLORS.gold};">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
            <tr>
              <td style="color:${COLORS.gold};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Order</td>
              <td style="color:${COLORS.gold};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-align:right;">Total</td>
            </tr>
          </table>
        </td>
      </tr>
      ${items.map(renderItemRow).join('')}
    </table>
  `
}

function renderTotals(order: OrderInfo): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:16px;">
      <tr>
        <td style="color:${COLORS.textDim};font-size:14px;padding:4px 0;">Subtotal</td>
        <td style="color:${COLORS.text};font-size:14px;padding:4px 0;text-align:right;">${money(order.subtotal)}</td>
      </tr>
      <tr>
        <td style="color:${COLORS.textDim};font-size:14px;padding:4px 0;">Tax</td>
        <td style="color:${COLORS.text};font-size:14px;padding:4px 0;text-align:right;">${money(order.tax)}</td>
      </tr>
      <tr>
        <td colspan="2" style="border-top:2px solid ${COLORS.gold};padding-top:12px;"></td>
      </tr>
      <tr>
        <td style="color:${COLORS.text};font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Total</td>
        <td style="color:${COLORS.gold};font-size:22px;font-weight:700;text-align:right;">${money(order.total)}</td>
      </tr>
    </table>
  `
}

function renderSpecialInstructions(order: OrderInfo): string {
  if (!order.special_instructions) return ''
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:24px;background:${COLORS.cardAlt};border-radius:10px;border-left:3px solid ${COLORS.gold};">
      <tr>
        <td style="padding:14px 18px;">
          <div style="color:${COLORS.gold};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">Special Instructions</div>
          <div style="color:${COLORS.text};font-size:14px;line-height:1.5;">${escape(order.special_instructions)}</div>
        </td>
      </tr>
    </table>
  `
}

function shellOpen(preheader: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Tacos Miranda</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};color:${COLORS.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;font-size:1px;color:${COLORS.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escape(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${COLORS.card};border-radius:14px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.5);">`
}

function shellClose(): string {
  return `
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function renderRestaurantEmail(order: OrderInfo, items: OrderItem[]): string {
  const total = money(order.total)
  const itemCount = items.reduce((n, i) => n + (i.quantity || 0), 0)
  const preheader = `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${total} · ${escape(order.customer_name || 'Guest')}`

  return `${shellOpen(preheader)}
          <tr>
            <td style="padding:28px 32px 8px;background:${COLORS.bg};border-bottom:1px solid ${COLORS.border};">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td>
                    <div style="color:${COLORS.gold};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">New Order</div>
                    <div style="color:${COLORS.text};font-size:32px;font-weight:700;letter-spacing:2px;margin-top:4px;">${escape(order.order_number)}</div>
                    <div style="color:${COLORS.textDim};font-size:13px;margin-top:4px;">${formatTime(order.paid_at || order.created_at)}</div>
                  </td>
                  <td align="right" style="vertical-align:top;">
                    <div style="background:${COLORS.gold};color:${COLORS.bg};display:inline-block;padding:8px 16px;border-radius:8px;font-size:18px;font-weight:700;letter-spacing:0.5px;">
                      ${total}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:${COLORS.cardAlt};border-radius:10px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                      <tr>
                        <td style="color:${COLORS.textDim};font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding-bottom:6px;">Customer</td>
                      </tr>
                      <tr>
                        <td style="color:${COLORS.text};font-size:15px;font-weight:600;line-height:1.5;">
                          ${escape(order.customer_name || 'Guest')}
                        </td>
                      </tr>
                      ${order.customer_phone ? `
                      <tr>
                        <td style="padding-top:6px;">
                          <a href="${PHONE_HREF}" style="color:${COLORS.gold};font-size:14px;text-decoration:none;">${escape(order.customer_phone)}</a>
                        </td>
                      </tr>` : ''}
                      ${order.customer_email ? `
                      <tr>
                        <td style="padding-top:4px;">
                          <a href="mailto:${escape(order.customer_email)}" style="color:${COLORS.textDim};font-size:13px;text-decoration:none;">${escape(order.customer_email)}</a>
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 28px;">
              ${renderItemsTable(items)}
              ${renderTotals(order)}
              ${renderSpecialInstructions(order)}
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px;background:${COLORS.bg};border-top:1px solid ${COLORS.border};text-align:center;">
              <div style="color:${COLORS.textFaint};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">
                Tacos Miranda &middot; Order Notification
              </div>
            </td>
          </tr>
${shellClose()}`
}

function renderCustomerEmail(order: OrderInfo, items: OrderItem[]): string {
  const preheader = `Order ${order.order_number} confirmed · ${money(order.total)} · We're cooking now.`

  return `${shellOpen(preheader)}
          <tr>
            <td align="center" style="padding:36px 32px 20px;background:${COLORS.bg};">
              <img src="${LOGO_URL}" alt="Tacos Miranda" width="180" style="display:block;width:180px;max-width:60%;height:auto;border:0;outline:none;text-decoration:none;">
              <div style="height:1px;width:48px;background:${COLORS.gold};margin:18px auto 14px;"></div>
              <div style="color:${COLORS.gold};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Order Confirmed</div>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:0 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:12px;">
                <tr>
                  <td align="center" style="padding:20px;">
                    <div style="color:${COLORS.textDim};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Order Number</div>
                    <div style="color:${COLORS.gold};font-size:34px;font-weight:700;letter-spacing:4px;margin-top:6px;line-height:1;">${escape(order.order_number)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 8px;">
              <div style="color:${COLORS.text};font-size:18px;font-weight:600;line-height:1.4;">
                Thanks${order.customer_name ? `, ${escape(order.customer_name)}` : ''}!
              </div>
              <div style="color:${COLORS.textDim};font-size:14px;line-height:1.6;margin-top:6px;">
                We received your order and we&rsquo;re cooking now. Head over and give us
                <strong style="color:${COLORS.gold};">10–15 minutes</strong> to have everything ready for pickup.
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 32px 0;">
              <div style="background:${COLORS.cardAlt};border-radius:10px;padding:12px 16px;border-left:3px solid ${COLORS.gold};">
                <div style="color:${COLORS.gold};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">Heads Up</div>
                <div style="color:${COLORS.textDim};font-size:12px;line-height:1.5;">
                  We don&rsquo;t track or update your order in real time. The 10–15 minute window is an estimate. If anything changes,
                  <a href="${PHONE_HREF}" style="color:${COLORS.gold};text-decoration:none;">give us a call</a>.
                </div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 28px;">
              ${renderItemsTable(items)}
              ${renderTotals(order)}
              ${renderSpecialInstructions(order)}
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:${COLORS.cardAlt};border-radius:12px;">
                <tr>
                  <td align="center" style="padding:20px;">
                    <div style="color:${COLORS.gold};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">Pickup</div>
                    <div style="color:${COLORS.text};font-size:14px;line-height:1.6;">${escape(RESTAURANT_ADDRESS)}</div>
                    <div style="margin-top:10px;">
                      <a href="${PHONE_HREF}" style="color:${COLORS.gold};font-size:16px;font-weight:600;text-decoration:none;letter-spacing:0.5px;">${escape(RESTAURANT_PHONE)}</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px;background:${COLORS.bg};border-top:1px solid ${COLORS.border};text-align:center;">
              <div style="color:${COLORS.textFaint};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">Tacos Miranda &middot; ${new Date().getFullYear()}</div>
              <div style="color:${COLORS.textFaint};font-size:11px;margin-top:6px;line-height:1.6;">
                Questions? Call <a href="${PHONE_HREF}" style="color:${COLORS.gold};text-decoration:none;">${escape(RESTAURANT_PHONE)}</a>
              </div>
            </td>
          </tr>
${shellClose()}`
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const { order, items } = JSON.parse(event.body || '{}') as { order: OrderInfo; items: OrderItem[] }

  if (!order || !items) {
    return { statusCode: 400, body: 'Missing order data' }
  }

  const restaurantHtml = renderRestaurantEmail(order, items)
  const customerHtml = renderCustomerEmail(order, items)
  const total = money(order.total)

  try {
    const RESEND_KEY = process.env.RESEND_API_KEY
    if (!RESEND_KEY) {
      console.log('No RESEND_API_KEY set, skipping email send.')
      console.log(`Would send: New Order ${order.order_number} - ${total}`)
      return { statusCode: 200, body: JSON.stringify({ success: true, sent: false }) }
    }

    const sends: Promise<Response>[] = []

    sends.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: [TO_EMAIL],
          subject: `New Order ${order.order_number} · ${total}`,
          html: restaurantHtml,
        }),
      }),
    )

    if (order.customer_email) {
      sends.push(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM,
            to: [order.customer_email],
            subject: `Order Confirmed · ${order.order_number}`,
            html: customerHtml,
          }),
        }),
      )
    }

    const results = await Promise.all(sends)
    for (const r of results) {
      if (!r.ok) console.warn('Resend non-OK:', r.status, await r.text())
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, sent: results.length }) }
  } catch (err: any) {
    console.error('Email error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

export { handler }
