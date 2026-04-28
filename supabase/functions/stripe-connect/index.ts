import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured in Supabase secrets yet' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })

    const { action, return_url, refresh_url } = await req.json()

    // Singleton: id='main'
    const { data: existing } = await supabase
      .from('stripe_settings')
      .select('*')
      .eq('id', 'main')
      .maybeSingle()

    if (action === 'create_account') {
      let accountId = existing?.stripe_account_id as string | null

      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'standard',
          metadata: { tacos_miranda: 'owner' },
        })
        accountId = account.id

        await supabase.from('stripe_settings').upsert({
          id: 'main',
          stripe_account_id: accountId,
          onboarding_complete: false,
          charges_enabled: false,
          payouts_enabled: false,
          updated_at: new Date().toISOString(),
        })
      }

      const link = await stripe.accountLinks.create({
        account: accountId!,
        return_url: return_url || 'https://tacosmiranda.com/admin/billing?stripe=return',
        refresh_url: refresh_url || 'https://tacosmiranda.com/admin/billing?stripe=refresh',
        type: 'account_onboarding',
      })

      return new Response(JSON.stringify({ url: link.url }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'check_status') {
      if (!existing?.stripe_account_id) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
      const account = await stripe.accounts.retrieve(existing.stripe_account_id)

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

      return new Response(
        JSON.stringify({
          connected: true,
          onboarding_complete: account.details_submitted,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          business_name:
            account.business_profile?.name ||
            account.settings?.dashboard?.display_name,
        }),
        { headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    if (action === 'login_link') {
      if (!existing?.stripe_account_id) {
        return new Response(JSON.stringify({ error: 'Not connected' }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
      // For Standard accounts, we use loginLink; but standard accounts log in with their own Stripe credentials.
      // For Express, loginLinks creates a single-sign-on URL. We'll fall back to the hosted dashboard URL.
      try {
        const link = await stripe.accounts.createLoginLink(existing.stripe_account_id)
        return new Response(JSON.stringify({ url: link.url }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        })
      } catch (_e) {
        return new Response(JSON.stringify({ url: 'https://dashboard.stripe.com/' }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[stripe-connect]', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
