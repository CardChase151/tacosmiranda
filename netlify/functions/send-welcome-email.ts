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

    const greeting = firstName ? `${firstName},` : ''

    const html = `
      <div style="max-width: 520px; margin: 0 auto; background: #000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">

        <!-- Header -->
        <div style="padding: 40px 32px 24px; text-align: center;">
          <h1 style="color: #fff; font-size: 28px; margin: 0 0 6px; letter-spacing: 3px; font-weight: 700;">TACOS MIRANDA</h1>
          <div style="width: 40px; height: 1px; background: #C8A84E; margin: 12px auto;"></div>
          <p style="color: #C8A84E; font-size: 11px; margin: 0; letter-spacing: 2px; text-transform: uppercase;">Huntington Beach, CA</p>
        </div>

        <!-- Body -->
        <div style="padding: 20px 32px 32px;">
          <p style="color: #fff; font-size: 18px; margin: 0 0 16px; font-weight: 500;">
            Thank you${greeting ? ', ' + greeting : '!'}
          </p>
          <p style="color: #B0B0B0; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">
            We truly appreciate you joining the Tacos Miranda family. It means a lot to have your support.
          </p>
          <p style="color: #B0B0B0; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
            As part of our list, you will be the first to hear about new menu items, special offers, and everything happening at the shop. We are always working to bring you the best authentic Mexican food, made fresh daily with white corn tortillas and premium beef tallow.
          </p>

          <!-- CTA -->
          <div style="text-align: center; margin: 28px 0;">
            <a href="https://www.google.com/maps/place/Tacos+Miranda/@33.6493169,-117.95565,17z"
               target="_blank"
               style="display: inline-block; padding: 12px 28px; background: #C8A84E; color: #000; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; text-decoration: none; border-radius: 4px;">
              Visit Us
            </a>
          </div>

          <!-- Info -->
          <div style="background: #111; border-radius: 8px; padding: 20px; margin-top: 24px;">
            <p style="color: #fff; font-size: 13px; margin: 0 0 4px; font-weight: 600;">21582 Brookhurst St, Huntington Beach, CA 92646</p>
            <p style="color: #9CA3AF; font-size: 13px; margin: 0 0 4px;">Open 7 days a week, 7 AM - 9 PM</p>
            <p style="color: #C8A84E; font-size: 13px; margin: 0; font-weight: 600;">(657) 845-4011</p>
          </div>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #1a1a1a; padding: 20px 32px; text-align: center;">
          <p style="color: #4B5563; font-size: 11px; margin: 0 0 4px;">White Corn Tortillas &middot; Cooked in Beef Tallow</p>
          <p style="color: #374151; font-size: 10px; margin: 0;">Tacos Miranda &copy; ${new Date().getFullYear()}</p>
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
        subject: 'Welcome to the Tacos Miranda Family',
        html,
      }),
    })

    const result = await res.json()
    return { statusCode: 200, body: JSON.stringify({ success: true, data: result }) }
  } catch (error: any) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }
}
