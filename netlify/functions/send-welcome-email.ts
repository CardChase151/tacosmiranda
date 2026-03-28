export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { to, firstName } = JSON.parse(event.body)
    if (!to) return { statusCode: 400, body: JSON.stringify({ error: 'Missing email' }) }

    const RESEND_API_KEY = process.env.RESEND_API_KEY
    if (!RESEND_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'No API key' }) }
    }

    const greeting = firstName ? `Hey ${firstName},` : 'Hey,'

    const html = `
      <div style="max-width: 500px; margin: 0 auto; background: #000; border-radius: 12px; overflow: hidden; font-family: -apple-system, sans-serif;">
        <div style="padding: 32px 28px; text-align: center; border-bottom: 1px solid #222;">
          <h1 style="color: #fff; font-size: 24px; margin: 0 0 4px; letter-spacing: 2px;">TACOS MIRANDA</h1>
          <p style="color: #C8A84E; font-size: 12px; margin: 0; letter-spacing: 1px;">White Corn Tortillas &middot; Beef Tallow</p>
        </div>
        <div style="padding: 28px;">
          <p style="color: #fff; font-size: 16px; margin: 0 0 12px;">${greeting}</p>
          <p style="color: #9CA3AF; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
            Welcome to the Tacos Miranda family. You will be the first to know about new menu items, specials, and events.
          </p>
          <div style="border-top: 1px solid #222; padding-top: 20px; margin-top: 20px;">
            <p style="color: #6B7280; font-size: 11px; margin: 0; text-align: center;">Tacos Miranda</p>
          </div>
        </div>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Tacos Miranda <noreply@mysendz.com>',
        to: [to],
        subject: 'Welcome to Tacos Miranda',
        html,
      }),
    })

    const result = await res.json()
    return { statusCode: 200, body: JSON.stringify({ success: true, data: result }) }
  } catch (error: any) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }
}
