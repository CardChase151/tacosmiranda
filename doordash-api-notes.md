# DoorDash API — Menu Sync Notes

For future reference when Charlie (or any restaurant client) wants to make
their tacosmiranda.com admin the single source of truth for their DoorDash
menu, with auto-markup pricing.

---

## The big picture

Two parts to a full DoorDash integration:

1. **Menu sync (push)** — Charlie edits menu on tacosmiranda.com → save → our
   function POSTs to DoorDash → tablet/storefront updates with prices marked
   up 20-30%.
2. **Order ingestion (pull)** — orders placed on DoorDash come back into our
   system as webhooks → land in our `orders` table → print on the same
   Star TSP143IV → Charlie sees them in the same admin dashboard.

Most clients only ask for #1. #2 is a much bigger lift but eliminates the
tablet entirely.

---

## DoorDash's APIs (which one we want)

DoorDash has two public API tracks. Easy to confuse:

| API | What it does | Want for Tacos? |
|---|---|---|
| **DoorDash Drive** | YOU are the merchant, DoorDash drivers fulfill orders YOU received on your own site/app | Maybe later, not the menu sync |
| **DoorDash Marketplace** | DoorDash brings you customers from their app, you fulfill | **Yes — this is what we want** |

Inside Marketplace, the relevant endpoints:

- **Menu API** (sometimes "Menu Manager" or "Menu Sync") — push menu structure
- **Order Webhook** — receive new orders from DoorDash app
- **Order Status API** — confirm/update status (accepted, preparing, ready)

For menu sync only, we just need the **Menu API**.

---

## Onboarding (the slow part — Charlie's job)

1. Charlie signs up at **developer.doordash.com**.
2. Applies for the **Direct Integration Partner** program (or "Menu Integration").
3. Signs the integration agreement.
4. Receives sandbox credentials.
5. We build + test against sandbox.
6. DoorDash certifies us (they review the integration).
7. Production credentials issued.

**Timeline: 2-4 weeks typical**, can stretch to 6+ if DoorDash is slow.
Charlie does steps 1-3 and 7. We do the build + cert.

**Bill 50% upfront** so we're not waiting unpaid during the approval bottleneck.

---

## Auth

- OAuth 2.0 or API key per merchant (DoorDash uses both depending on track).
- Per-store credentials: each physical location has its own
  `external_store_id`. Tacos Miranda is one store.
- Tokens are scoped to that store. Don't share across clients.
- Store the API key in Supabase secrets, not in the client bundle.

---

## What can be synced via Menu API

| Field | Source on tacosmiranda.com | Notes |
|---|---|---|
| Menu structure (categories) | `menu_categories` table | Map to DoorDash "menu_category" |
| Item name | `menu_items.name` | Direct |
| Item description | `menu_items.description` | Direct |
| Item price | `menu_items.price * markup_factor` | **Apply markup here** |
| Item availability | `!menu_items.is_86` | When Charlie 86s, push availability=false |
| Modifier groups | `modifier_groups` | Required vs optional, min/max selections |
| Modifiers | `modifiers` | With upcharges, marked up too |
| Item images | (none currently) | DoorDash strongly recommends; could add later |
| Hours | `business_hours` | Optional sync |

**Lock in the markup logic in one place.** Recommended: a `pos_settings`
table with a `doordash_markup_factor numeric default 1.25` row. Admin can
change it from the dashboard.

---

## Markup math (the trap)

Don't just multiply by 1.25 and call it done. Real considerations:

1. **Round to make prices look right.** $4.99 × 1.25 = $6.2375 — that should
   become $6.25 or $5.99, not $6.24. Use a rounding strategy:
   - Round to nearest 0.05 → 6.2375 → 6.25
   - Or "psychological" rounding: round up to next .X9 → $6.49
2. **Apply markup to MODIFIER upcharges too.** $1 cheese addon becomes $1.25
   on DoorDash, otherwise the math doesn't add up.
3. **Don't double-tax.** Our system charges 7.75% tax on top of price.
   DoorDash also handles tax — pass them the pre-tax price, let DoorDash
   compute tax on their side.
4. **Service fees are DoorDash's concern.** They add their own delivery fee,
   service fee, and tip on top of menu price. Customer-visible total on
   DoorDash != menu price. We don't model that.

---

## Price parity risk (real, not theoretical)

DoorDash has pushed for **menu price parity** in some markets — meaning the
same price shown on DoorDash as on the restaurant's own site. They started
publicly threatening to penalize restaurants that mark up too aggressively
(reduced search ranking, "value pricing" badges, etc.).

**Practical guidance:**
- 20-25% markup is common practice and rarely flagged.
- 30%+ starts to get noticed, especially if your own-site price is public
  (which Tacos Miranda's is — visible at /menu).
- 50%+ will likely get flagged or penalized.
- Check DoorDash's current merchant agreement for your client's market —
  the rules differ by city.

If price parity becomes mandatory, the play becomes: charge same on both
platforms, and **eat the DoorDash commission as a cost of customer
acquisition**. Mark up everywhere by enough to absorb it (15-20% across
the board, including own-site).

---

## Implementation sketch (when we build)

```
┌─────────────────────┐         ┌────────────────────┐
│  tacosmiranda.com   │  edit   │ Supabase           │
│  /admin (Charlie)   │─menu───▶│ menu_items table   │
└─────────────────────┘         └─────────┬──────────┘
                                          │ on update
                                          ▼
                                ┌─────────────────────┐
                                │ Supabase trigger or │
                                │ Netlify function    │
                                │ doordash-sync       │
                                └─────────┬───────────┘
                                          │ POST
                                          ▼
                                ┌─────────────────────┐
                                │ DoorDash Menu API   │
                                │ /menus endpoint     │
                                └─────────┬───────────┘
                                          │
                                          ▼
                                ┌─────────────────────┐
                                │ DoorDash storefront │
                                │ + Charlie's tablet  │
                                └─────────────────────┘
```

Trigger options:
- **Manual "Push to DoorDash" button** in admin (cleanest, deliberate).
- **Auto on save** (slick but easy to fire too many requests if Charlie
  edits in a flurry — debounce to 30s).
- **Cron / scheduled** (every hour) — safest fallback.

Recommend: **Push button** as MVP, debounced auto-sync as v2.

---

## Order ingestion (if we go full integration)

If Charlie wants to ditch the tablet entirely:

1. Configure DoorDash webhook URL → Supabase edge function.
2. New order arrives → insert into `orders` + `order_items` tables with
   `source = 'doordash'`.
3. Same printer prints it (no code change needed — printer just polls our
   queue).
4. Send order status updates back via DoorDash Order Status API as Charlie
   marks it ready.

This is **much bigger** than menu sync alone. Probably 20-30 hours of work
+ more rigorous DoorDash certification. Quote separately.

---

## Alternatives (when direct API is too slow)

If Charlie's onboarding stalls at DoorDash, three workarounds:

1. **POS aggregator middleware** — Otter ($0-149/mo), Deliverect ($89-249/mo),
   Cuboh ($79-199/mo), Ordermark. They sit between us and DoorDash + Uber Eats
   + Grubhub. Pre-certified, faster to launch. Worth it if client wants
   multi-platform.

2. **Use a POS that already integrates** — Square for Restaurants, Toast,
   Clover all have certified DoorDash integrations. Charlie buys their POS,
   their POS handles the sync. Charlie loses our admin dashboard for menu
   editing.

3. **Stay manual** (current state) — Charlie edits in two places. Annoying
   but $0 cost.

Default recommendation: **direct API integration**. Cheapest at scale, full
control, branded experience.

---

## Pricing this work for clients

For a single-location restaurant, Tacos-Miranda-sized:

| Scope | Hours | Quote |
|---|---|---|
| Menu sync only (push) | 10-15 | $1,500-2,500 |
| Menu sync + order ingestion | 30-45 | $4,500-6,500 |
| + Multi-platform (Uber Eats too) | +15 each | +$2,000 each |

Bill 50% upfront because of the DoorDash approval wait time.

**Reusable across clients.** Once built for one restaurant, the cert process
for the second client is faster (DoorDash recognizes the same partner code).
Treat the first build as pilot pricing, then full rate after.

---

## Open questions to research before quoting a real client

1. Does DoorDash currently require a separate integration cert per merchant,
   or is one-time partner cert enough? (Affects how reusable the build is.)
2. Are sandbox credentials self-serve or gated behind a sales call?
3. What's the rate limit on the Menu API? Affects debounce strategy.
4. Does DoorDash pass through modifier IDs reliably for order ingestion, or
   do we have to match by name? (Affects how robust the order import is.)
5. What's the latency on menu sync — does the change hit the storefront in
   seconds, or take hours to propagate?

These are the things to dig into the day Charlie hands over API creds.

---

## Reference links

- DoorDash Developer Portal: https://developer.doordash.com
- Marketplace API docs (gated, requires login)
- Drive API docs (public): https://developer.doordash.com/en-US/docs/drive
- Status / known issues: not publicly tracked, ask the partner integrations
  team during cert
