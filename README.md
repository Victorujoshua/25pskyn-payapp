# 25 Pskyn Laser Workshop — Checkout Service

A tiny backend that sells the **8 shared seats** for the Aesthetic Laser Workshop 2026
and routes payment to **Paystack**. Overselling past 8 is impossible: every seat is
reserved through a Postgres function that locks the event row before counting, so two
people clicking "Pay" at the same instant can never both take the last seat.

Stack: **Next.js 14 (App Router) · Supabase · Paystack · Vercel**

---

## How it works

1. The Shopify section (`shopify/laser-register.liquid`) loads and calls **`/availability`**
   → shows "X of 8 seats left", or flips to **Sold Out** at 0.
2. Buyer picks a tier + enters email → the page calls **`/checkout`**.
   - `/checkout` **atomically reserves** a seat (a 30-min hold). If the pool is full it
     returns `409 sold_out`.
   - It then asks Paystack to **initialise the transaction with a server-locked amount**
     (the client never sends the price) and returns an `access_code`.
3. The page opens the **Paystack popup on the page** with that access code. Payment happens
   right there.
4. Paystack calls **`/webhook`** (`charge.success`). We verify the signature and **finalise**
   the seat. The page also calls **`/verify`** for a fast confirmation. The webhook is the
   source of truth.
5. Abandoned holds expire after 30 min and the seat frees up. `/availability` already ignores
   expired holds, so the count is always correct; the cron is just for tidy data.

**Capacity guard:** if a payment somehow lands after all 8 are paid (e.g. a hold expired then
the buyer paid late), `finalize_seat` marks it `overflow` instead of seating a 9th person, and
logs that a refund is needed. With 8 high-ticket seats this is extremely unlikely, but the
guarantee holds.

---

## Setup

### 1. Supabase
1. Create a project (or reuse one).
2. SQL editor → paste & run **`supabase/schema.sql`**. This creates the tables, the atomic
   functions, and enables RLS (so the public anon key can't touch the data — only this
   service uses the service-role key).
3. Project Settings → API → copy the **Project URL** and the **`service_role`** secret.

### 2. Paystack
1. Dashboard → Settings → API Keys & Webhooks → copy your **secret** and **public** keys.
2. Leave the webhook URL for after deploy (step 4).

### 3. Deploy to Vercel
```bash
npm install
# push to a Git repo, import into Vercel, OR:
npx vercel --prod
```
Set these Environment Variables in Vercel (Project → Settings → Environment Variables) —
see `.env.example`:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` secret (server only) |
| `PAYSTACK_SECRET_KEY` | `sk_live_…` |
| `PAYSTACK_PUBLIC_KEY` | `pk_live_…` (reference; the public key goes in the Shopify section) |
| `ALLOWED_ORIGINS` | `https://25pskyn.com,https://www.25pskyn.com` |
| `CRON_SECRET` | any random string (optional, protects the cleanup cron) |

### 4. Point Paystack at the webhook
Paystack Dashboard → Settings → API Keys & Webhooks → **Webhook URL**:
```
https://YOUR-DEPLOYMENT.vercel.app/api/webhook
```

### 5. Wire up Shopify
Add `shopify/laser-register.liquid` to your theme's `sections/` folder, drop the
**Laser · Register** section onto the workshop page, and in the Theme Editor set:
- **Checkout API base URL** → `https://YOUR-DEPLOYMENT.vercel.app`
- **Paystack public key** → `pk_live_…`

Then point the **"Register Now"** button on the pricing-table section at `#register`
(the register section's anchor) so it scrolls down to the form.

---

## Editing the workshop

- **Prices / early-bird cutoff** → `lib/config.ts` (single source of truth, in kobo).
  The early-bird price applies automatically until `2026-07-01 00:00 WAT`, then the
  late-entry price kicks in.
- **Seat count** → change `total_seats` in the `workshop_event` row (default 8).
- **Hold duration** → `RESERVATION_TTL_MINUTES` in `lib/config.ts`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/availability` | seats left + current prices (called by the page) |
| POST | `/api/checkout` | reserve a seat + initialise Paystack |
| POST | `/api/webhook` | Paystack `charge.success` → finalise (signature-verified) |
| GET | `/api/verify?reference=…` | fast confirmation after the popup closes |
| GET | `/api/cron/release` | tidy expired holds (scheduled in `vercel.json`) |

## Testing
Use Paystack **test keys** first. Make four test payments to confirm the pool drops to 0 and
the 5th attempt returns Sold Out, then switch to live keys.
