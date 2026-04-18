# Tacos Miranda — Stripe Setup

Everything is built. This doc covers what was done and what's left for Chase to finish when home (needs Stripe dashboard access).

## What's built and deployed

### Database
- `profiles.billing` boolean column — gates the top-nav "Billing" button
- `orders` got: `stripe_payment_intent_id`, `stripe_checkout_session_id`, `stripe_fee_amount`, `application_fee_amount`, `net_amount`, `paid_at`
- `stripe_settings` singleton (already existed) stays the source of truth for connection state

### Owner account
- **charlie@tacosmiranda.com** / **Miranda2026!**
- `is_admin: true`, `billing: true`

### Supabase Edge Functions (all deployed)
1. **stripe-connect** — actions: `create_account`, `check_status`, `login_link`
2. **stripe-checkout** — creates Stripe Checkout Session on Charlie's connected account, 1% `application_fee_amount` → Chase's platform
3. **stripe-webhook** — verifies signatures, handles `checkout.session.completed` (flips order to `pending` for the printer), `account.updated` (syncs settings), `checkout.session.expired/failed` (marks order failed)

### Frontend
- `/admin/billing` — Charlie's Stripe setup + manage bank info button
- `/admin/dashboard` — sales dashboard with gross/fees/net, CSV export, date ranges
- Top nav gets a green "Billing" button ONLY when logged in as Charlie (`profile.billing=true`)
- Top nav gets a purple "Dashboard" button for any admin
- `OrderCheckout.tsx` — if `stripe_settings.charges_enabled=true`, routes through Stripe. Otherwise falls back to direct order insert (current behavior).

## What Chase needs to do when home

### 1. Create a Stripe account (or use existing) and enable Connect
- Go to https://dashboard.stripe.com
- Make sure you're in **TEST MODE** (toggle top-right)
- Settings → Connect → make sure Connect is enabled (free, no approval needed for Standard accounts in test mode)

### 2. Grab the test secret key
- Developers → API keys → Reveal secret key
- Copy `sk_test_...`

### 3. Add it to Supabase secrets
- https://supabase.com/dashboard/project/pjnctwrgudfczhkjsigf/functions/secrets
- Add: `STRIPE_SECRET_KEY` = `sk_test_...`

### 4. Set up the webhook
- Stripe dashboard → Developers → Webhooks → Add endpoint
- URL: `https://pjnctwrgudfczhkjsigf.supabase.co/functions/v1/stripe-webhook`
- Events to send: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_failed`, `account.updated`
- **Important**: check "Listen to events on Connected accounts" so events for Charlie's account flow through
- After creating, reveal the "Signing secret" (`whsec_...`)
- Add it to Supabase secrets: `STRIPE_WEBHOOK_SECRET` = `whsec_...`

### 5. Test the Charlie flow
- Sign out, sign in as `charlie@tacosmiranda.com` / `Miranda2026!`
- Click "Billing" in nav
- Click "Connect Stripe Account"
- Go through Stripe's test onboarding (use test data — Stripe provides sample numbers)
- After return, status should show `Accepting charges: Yes` and `Payouts enabled: Yes`
- Click "Manage Bank & Payouts" to confirm the Stripe dashboard opens

### 6. Test an order end-to-end
- Place an order as a regular customer
- Should redirect to Stripe Checkout
- Use test card `4242 4242 4242 4242`, any future date, any CVC, any ZIP
- After paying, webhook flips order to `pending` → CloudPRNT printer picks it up → prints
- Check `/admin/dashboard` as chase@gmail.com — should see the order with fee breakdown

## Going live (when ready)
1. Switch Stripe dashboard to LIVE MODE
2. Swap `STRIPE_SECRET_KEY` in Supabase secrets to `sk_live_...`
3. Create a LIVE webhook (same URL + events) and swap `STRIPE_WEBHOOK_SECRET` to new `whsec_...`
4. Charlie re-does onboarding (live mode is separate from test — same app, different data)
5. Toggle off Test Mode in `/admin/billing`

## Fee math (confirmed with Chase)
On a $20 order:
- Customer pays $20.00
- Stripe takes ~$0.88 (2.9% + $0.30)
- Chase takes $0.20 (1% application_fee)
- Charlie nets $18.92

Both Stripe fees and the 1% platform fee are deductible business expenses for Charlie's taxes — the dashboard CSV export breaks them out line-by-line.
