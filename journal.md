# Tacos Miranda - Online Ordering Journal

Tracking every step of getting online orders → paid → printed → fulfilled.

## Goal
Customer orders on tacosmiranda.com → pays via Stripe (1% platform fee) → receipt auto-prints at the restaurant → Charlie sees a simple sales dashboard.

---

## Where we are (as of 2026-04-17)

### ✅ DONE
- **Printer wired end-to-end**: Star TSP143IV on 192.168.1.78 polls Supabase edge function every 5s, prints orders as plain text at 80mm/48-char width. Call-out name emphasized top + bottom. 7 printer fn versions deployed — v6 is current production.
- **Stripe Connect infrastructure**: 3 edge functions deployed (stripe-connect, stripe-checkout, stripe-webhook), wired for Direct Charges with 1% application_fee_amount to App Catalyst platform.
- **DB schema**: `profiles.billing` column + Stripe columns on orders (`stripe_payment_intent_id`, `stripe_checkout_session_id`, `stripe_fee_amount`, `application_fee_amount`, `net_amount`, `paid_at`).
- **Owner account**: `charlie@tacosmiranda.com` / `Miranda2026!` with `is_admin=true, billing=true`.
- **UI**: polished `/admin/billing` page (Charlie only) + `/admin/dashboard` (all admins). Green "Billing" button in top nav only shows for Charlie. Purple "Dashboard" button for all admins.
- **Supabase secrets**: `STRIPE_SECRET_KEY` (live sk_live) + `STRIPE_WEBHOOK_SECRET` (live whsec) both stored via CLI.
- **Live webhook**: `we_1TNPiWQ9kGXQ4OluiT4McRU4` created in Stripe, listens to Connected-account events.
- **OrderCheckout flow**: auto-detects if Stripe is ready (`stripe_settings.charges_enabled=true`) and routes through Checkout; otherwise falls back to direct insert so nothing breaks before Charlie connects.

### 🟨 IN PROGRESS — Weekend rollout
- Charlie signs in this weekend, goes through Stripe Connect onboarding (banking, SSN/EIN, business info).
- Chase + Charlie run 1 real test order with a real card to confirm the full pipeline.

### ❌ NOT STARTED — before full launch confidence
- **Branded customer confirmation email** — existing `order-email.ts` fires on old direct-insert path but NOT on the Stripe flow. Customers currently get only Stripe's generic receipt. We should trigger `order-email.ts` from the `stripe-webhook` on `checkout.session.completed` so customers get a "Tacos Miranda — your order is being prepared" email.
- **Post-checkout thank-you page** — after payment Stripe redirects to `/my-orders?session_id=...`. Need to confirm MyOrders page resolves session → order and shows a clear "Order #TM-12345 is being prepared — est 20 min" confirmation screen.
- **Admin/staff order notifications** — decide: printer receipt alone (current) vs. also email/text Charlie when a new paid order hits.
- **Kitchen/staff workflow** — verify `MyOrders` or add "Today's orders" view with "Mark completed" button for staff.
- ~~**Refund sync**~~ — **DECIDED (2026-04-18): no self-service refunds or cancellations.** Cooking starts immediately when the ticket prints. Customer-facing policy notes added on checkout + MyOrders pages telling customers to call the restaurant directly for any issues. If Charlie ever issues a manual refund through the Stripe dashboard, the order record stays as "confirmed" in our DB (he can note it in Stripe). We can revisit webhook-driven refund sync later if it matters, but the usual restaurant pattern is Stripe-only.
- **Kill switch** — currently anyone visiting tacosmiranda.com/order can place an order. Once Charlie completes onboarding, this is LIVE. If we want a quiet soft launch, add a per-order-type toggle or password-gate the page.

---

## Hardware/Printer details

---

## Confirmed 2026-04-17

### Printer
- **Model**: Star TSP143IV-UE (USB + Ethernet, TSP100IV family)
- **Firmware**: Ver 3.3 -b3.3
- **USB-ID / Serial**: 26100250714135945
- **Network** (DHCP, currently on LAN):
  - IP: `192.168.1.78`
  - Subnet: `255.255.255.0`
  - Gateway: `192.168.1.1`
  - MAC: `00:11:62:54:33:22`
- **CloudPRNT**: Service ENABLED, poll interval 5 sec, HTTP timeout 60 sec
- **Star Micronics Cloud**: also ENABLED, Device ID `re0jy9649zwg`
- **TLS**: TLS 1.3, HIGH + MEDIUM encryption
- **Certs installed**: none (uses self-signed default — fine for our Netlify HTTPS target)

### App
- Star Quick Setup Utility (on Chase's phone) — used to print the config self-tests above

### Pi (reserve for fallback Option B)
- Raspberry Pi Model B
- Currently has RetroPie OS (will reflash to Raspberry Pi OS if needed)

### Credentials
- **Printer admin password**: `Tacos2026!`
  - Used for: Star Quick Setup Utility app AND web UI at `http://192.168.1.78`
  - Default username is usually `root`

---

## Backend (deployed)

- **Site**: https://tacosmiranda.com
- **Netlify function**: `netlify/functions/cloudprnt.ts`
- **Public CloudPRNT endpoint**: `https://tacosmiranda.com/cloudprnt`
- **Settings handshake**: `https://tacosmiranda.com/cloudprnt-setting.json`
- **Supabase project**: `pjnctwrgudfczhkjsigf.supabase.co`
- **Tables**: `orders`, `order_items`, `order_item_modifiers`, `order_item_ingredients`

The function is wired for 3 HTTP methods:
- `POST /cloudprnt` — printer polls; we return `{jobReady: true, jobToken}` if there's a pending order, else `{jobReady: false}`
- `GET /cloudprnt?token=X` — printer fetches the Star-markup receipt body
- `DELETE /cloudprnt?token=X` — printer confirms printed; we flip `orders.printed = true`

---

## Plan: try Option A (CloudPRNT direct)

The printer is network-connected, CloudPRNT is enabled, and our Netlify endpoint is live. The ONLY thing missing is telling the printer what URL to poll.

### Next step
Set the **Server URL** in the printer to:
```
https://tacosmiranda.com/cloudprnt
```

Two ways to do this (any one works):

**Via Star Quick Setup Utility app** (easiest — Chase has it on phone)
1. Open app → connect to printer `192.168.1.78`
2. Tap "Network Settings" or "CloudPRNT Settings"
3. Find "Server URL" field
4. Paste `https://tacosmiranda.com/cloudprnt`
5. Save / Apply — printer reboots

**Via printer web UI** (browser on same WiFi)
1. Open `http://192.168.1.78` in a browser on the same network
2. Login: user `root` / password `public` (default on Star)
3. Navigate to CloudPRNT settings
4. Server URL → `https://tacosmiranda.com/cloudprnt`
5. Save

---

## Attempt log

### 2026-04-17 — Initial recon
- Printed 3 config self-tests from the printer (photos received)
- Confirmed model: TSP143IV-UE
- Confirmed CloudPRNT service ENABLED, printer online at 192.168.1.78
- Confirmed Netlify function deployed at tacosmiranda.com/cloudprnt

### 2026-04-17 1:56pm — Found root cause
Screenshot from Star Quick Setup Utility showed current Server URL was:
```
http://192.168.1.99:8181/cloudprnt
```
That's a stale local dev URL (old `netlify dev` session on Chase's Mac at port 8181). Local IP 192.168.1.99 isn't running anything now. Printer has been polling a dead address — which is why nothing ever printed.

### 2026-04-17 — Fix: update Server URL
- Action: replace Server URL with `https://tacosmiranda.com/cloudprnt` in the Star app. Keep basic auth OFF, TLS Trust OFF. Hit Apply.
- Result (13:56): Chase applied. Printer beeped success.

### 2026-04-17 2:05pm — Redirect is broken, switching to direct fn path
- Sanity curl to `https://tacosmiranda.com/cloudprnt` returned either "Bad request, missing form" (Netlify's default POST handler for pages) OR 404 HTML (SPA fallback). The `[[redirects]] from = "/cloudprnt"` in netlify.toml is being shadowed by the `/*` SPA wildcard.
- Direct call to `https://tacosmiranda.com/.netlify/functions/cloudprnt` works and returns `{"jobReady":true,"jobToken":"6941f0e6-dd5b-4583-b85c-f1bf05e8942d"}` — so there's already a stale/test order waiting in the queue.
- **Action**: update Server URL on printer to `https://tacosmiranda.com/.netlify/functions/cloudprnt`. Apply.
- **Followup (lower priority)**: fix the `/cloudprnt` redirect so the cleaner URL works. Likely needs `force = true` on the redirect OR specifying HTTP method.

### 2026-04-17 2:07pm — Chase applied new URL, printer confirmed, but STILL no poll hits
- Stale order (TM-TEST from Apr 9) still `printed: false` in Supabase
- Same jobToken returned for 20+ seconds of direct polling from our side = printer hasn't fetched anything
- Ping/port scan confirms printer IS reachable at 192.168.1.78 from Chase's Mac (port 80 open)
- Added `console.log` to cloudprnt.ts, pushed (commit d7e9e05) so we can see any hits in Netlify logs

### 2026-04-17 2:10pm — Suspecting HTTPS/TLS handshake fail on printer
- Star printers with older firmware sometimes reject modern Let's Encrypt ISRG Root X1 chain even though the CA bundle is current.
- "Print Test" working from Star app uses Star Micronics Cloud, NOT arbitrary HTTPS — so it doesn't prove HTTPS to tacosmiranda.com works.
- **Action**: on Star Quick Setup Utility app, flip **Change TLS Trust Level** ON → select **Accept all (Warning - not secure!)** → Apply. DONE.

### 2026-04-17 2:20pm — TLS fix didn't help, deeper diag
- Network from Mac: ping works, port 80 open — printer IS on the LAN.
- Chase browsing `http://192.168.1.78` doesn't load → may be because Chase's phone was on cellular, not the restaurant's WiFi. Mac confirms port 80 is open.
- Found `cloudprnt-settings.ts` handshake had `serverSupportProtocol: ['HTTP']` only — fixed to `['HTTP', 'HTTPS']` and pushed (commit f23d860). This is a minor spec-compliance fix, may or may not be the cause.

### 2026-04-17 2:28pm — BREAKTHROUGH: printer IS polling
Correct Netlify dashboard URL is `https://app.netlify.com/projects/{slug}/logs-and-metrics/functions/cloudprnt` (they renamed sites → projects in UI, CLI still says "sites"). Chase's actual slug is `thunderous-marshmallow-f5370f` (`tacosmiranda.com` is just the custom domain).

**Function log shows consistent 5-sec invocation cadence at 02:06:26 → 02:06:31 → 02:06:37 → 02:06:43.** That IS the printer polling. So:
- Printer reaches us ✅
- TLS handshakes ✅
- POST returns 200 ✅
- Function reads DB ✅

**BUT** stale order `6941f0e6-dd5b-4583-b85c-f1bf05e8942d` is still `printed: false` in Supabase. Meaning the printer is POSTing, getting `{"jobReady":true, "jobToken":"..."}`, but NOT following through with the GET (fetch receipt body) or DELETE (confirm printed).

### 2026-04-17 2:30pm — Next diagnostic
- Click one of the recent log lines in the Netlify dashboard to see the expanded stdout — confirm `[CloudPRNT] POST /cloudprnt` lines exist (from our added console.log). Screenshot what method is logged.
- If logs show POST only (no GET), the printer is rejecting our response format. Most likely the `mediaTypes: ["text/vnd.star.markup"]` is wrong for this model — TSP143IV may want different media type identifiers or require a `clientAction` directive.

### 2026-04-17 2:40pm — Switched to Supabase edge function
Netlify's log UI is limited (no expandable rows for console.log output). Switching the printer to Supabase instead because:
- Supabase dashboard shows live console.log output
- Direct DB access (no Netlify→Supabase hop)
- Deno edge runtime = faster
- Function was already scaffolded at `supabase/functions/cloudprnt/`

Deployed v2 with verbose logging + expanded mediaTypes list. New printer Server URL:
```
https://pjnctwrgudfczhkjsigf.supabase.co/functions/v1/cloudprnt
```

Log viewer: https://supabase.com/dashboard/project/pjnctwrgudfczhkjsigf/functions/cloudprnt/logs

Expanded mediaTypes:
- `text/vnd.star.markup` (CloudPRNT markup we already use)
- `application/vnd.star.line` (StarPRNT line-mode raw)
- `application/vnd.star.starprnt` (StarPRNT raster/raw)

### 2026-04-17 2:45pm — AHA: printer does settings handshake first
Supabase logs showed:
```
GET | 404 | /functions/v1/cloudprnt-setting.json?mac=00:11:62:54:33:22
```

The Star printer AUTO-APPENDS `-setting.json` to the configured Server URL on first contact. Since our function is named `cloudprnt`, Supabase tried to route to a function named `cloudprnt-setting.json` (doesn't exist) → 404 → printer gives up.

**Fix**: change the printer's Server URL so the `-setting.json` suffix lands INSIDE our function's path namespace. Instead of setting the URL to just `.../cloudprnt`, add a subpath like `.../cloudprnt/poll`. Then:
- Polling URL: `.../cloudprnt/poll`
- Handshake URL: `.../cloudprnt/poll-setting.json`

Both route to the same `cloudprnt` function because Supabase captures everything after the function name as path. Our function checks `pathname.includes('setting.json')` to serve the handshake JSON.

Deployed v3 of the function with handshake handler.

**New Server URL**:
```
https://pjnctwrgudfczhkjsigf.supabase.co/functions/v1/cloudprnt/poll
```

### 2026-04-17 2:40pm — 🎉 END-TO-END WORKS
Stale TM-TEST order from Apr 9 physically printed at the restaurant. Trace from Supabase edge logs:
- 14:39  GET  404 `/cloudprnt-setting.json` (handshake — printer ignored the 404 and proceeded anyway)
- 14:39  POST 200 `/cloudprnt?t=...` → jobReady:true, token=6941f0e6...
- 14:39  GET  200 `/cloudprnt?mac=00:11:62:54:33:22&type=application/vnd.star.starprnt&token=6941f0e6...` — printer fetched the receipt
- 14:40  DELETE 200 `/cloudprnt?code=200+OK&token=6941f0e6...` — printer confirmed it printed
- Since then: POST every ~5s returning jobReady:false

Order in Supabase flipped to `printed: true, status: confirmed`.

Root cause was TWO things stacked:
1. Netlify's SPA fallback was intercepting the CloudPRNT URLs (dashboard log UX also made this hard to debug)
2. Our `mediaTypes` list only offered `text/vnd.star.markup`. The TSP143IV specifically wants `application/vnd.star.starprnt` in its Accept header. Expanding to all three Star formats let the negotiation succeed.

### Production-ready config
- **Platform**: Supabase edge functions (NOT Netlify)
- **Function**: `cloudprnt` (already deployed, v3)
- **Printer Server URL**: `https://pjnctwrgudfczhkjsigf.supabase.co/functions/v1/cloudprnt/poll`
- **Polling**: 5 sec
- **TLS**: Accept all (printer setting)
- **Log viewer**: https://supabase.com/dashboard/project/pjnctwrgudfczhkjsigf/functions/cloudprnt/logs

### Next steps
1. **Place a real test order** on tacosmiranda.com — should print within 5-10 sec.
2. (Optional) clean up the unused `netlify/functions/cloudprnt.ts` since we're on Supabase now, OR keep it as a fallback.
3. (Optional) add a Supabase realtime subscription so the order admin dashboard updates in real time when `printed=true`.

---

## Diagnostic commands (run from Chase's Mac)

```bash
# Watch Netlify function logs live (see printer hits in real time)
netlify logs:function cloudprnt

# Manually poll the endpoint (should return {"jobReady": false} if no orders)
curl -X POST https://tacosmiranda.com/cloudprnt

# Check for pending orders in Supabase
curl -H "apikey: $ANON_KEY" \
  "https://pjnctwrgudfczhkjsigf.supabase.co/rest/v1/orders?printed=eq.false&status=eq.pending&select=id,order_number,created_at"
```

---

## Reference
- Star CloudPRNT dev docs: https://www.starmicronics.com/pages/star-cloudprnt
- TSP143IV manual: https://starmicronics.com/support/products/tsp100iv-series/
- Markup format used in our fn: `text/vnd.star.markup` (align, mag, bold, column, cut)
