# 99Estate

A property marketplace where **browsing is free, every user gets 2 seller-contact unlocks free per day, and additional contacts cost ₹9**.

The ₹9 is never for viewing a property. Listings are fully public — photos, price, locality, specifications. The charge exists only to reveal a seller's private phone number once the daily free quota is spent.

- **Next.js 15 App Router** · TypeScript · Tailwind CSS v4
- **Supabase** — Postgres, Auth (Google OAuth), Storage
- Server Components by default; Client Components only where interaction demands it

---

## Getting started

### 1. Install

```bash
npm install
```

> **On this machine:** TLS is terminated by an inspecting proxy whose root CA lives in the
> Windows certificate store, which Node does not read by default. Without the flag below,
> npm fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`:
>
> ```powershell
> $env:NODE_OPTIONS = '--use-system-ca'; npm install
> ```
>
> Set `NODE_OPTIONS=--use-system-ca` permanently (System → Environment Variables) to avoid
> repeating it.

### 2. Create a Supabase project

Then copy the template and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Where to find it | Exposed to browser |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API | **never** |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally | yes |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console | no |

### 3. Apply the database migrations

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or, for a fully local stack (requires Docker):

```bash
npx supabase start
npx supabase db reset      # applies every migration from scratch + seeds
```

Regenerate the TypeScript schema types after any migration change:

```bash
npm run db:types
```

### 4. Enable Google sign-in

In the Supabase dashboard → **Authentication → Providers → Google**:

1. Paste your Google OAuth client ID and secret.
2. In Google Cloud Console, add this authorised redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`
3. In Supabase → **Authentication → URL Configuration**, add
   `http://localhost:3000/auth/callback` to the redirect allow-list.

### 5. Run

```bash
npm run dev      # http://localhost:3000
npm run check    # typecheck + lint
npm run build    # production build
```

---

## How the money rules are enforced

Every commercial rule lives in the database, not in the application, because the application
is a client of the database and clients can be tampered with.

| Rule | Where it is enforced |
| --- | --- |
| Posting and browsing are free | No paywall exists; `properties` has no price-to-view concept |
| 2 free unlocks per IST calendar day | `get_daily_contact_usage()` — counts settled unlocks between `ist_day_start()` and the next 00:00 Asia/Kolkata |
| ₹9 after the free quota | `contact_unlock_price()` reads `app_settings`; the amount is never accepted from a request body |
| Unlocking twice never charges twice | Partial unique index `contact_unlocks (user_id, property_id) WHERE payment_status = 'success'` |
| Unlocks only exist after authorisation | `contact_unlocks`, `payments` and `leads` have **no client INSERT policy** — the only writers are `SECURITY DEFINER` RPCs |
| Seller numbers are private | `profiles.mobile_number` is readable only through the `unlocked_seller_contacts` view, which filters on a settled unlock |
| Every unlock creates a lead | `request_contact_unlock()` / `settle_paid_contact_unlock()` insert the lead in the same transaction |
| Quota resets at midnight IST | `date_trunc('day', ts AT TIME ZONE 'Asia/Kolkata')` — a calendar boundary, not a rolling window |

Two concurrent tabs cannot both spend the last free unlock: `request_contact_unlock()` takes
`pg_advisory_xact_lock(hashtextextended(user_id))` before recounting, and the partial unique
index is the backstop if the lock is ever bypassed.

---

## Project layout

```
app/
  (public)/            marketing + browse surfaces (header/footer shell)
    page.tsx           home
  auth/callback/       OAuth code exchange
  login/               Google sign-in
  complete-profile/    mandatory mobile number capture

components/
  ui/                  design-system primitives (button, field, card, dialog, toast…)
  layout/              header, footer, logo, navigation
  auth/                sign-in and profile forms
  property/            property card, rails, hero search

lib/
  supabase/            browser / server / service-role / middleware clients
  auth/                session helpers and server actions
  profile/             profile server actions
  properties/          listing queries
  contacts/            daily free-quota helpers
  env.ts               validated environment access
  format.ts            ₹ lakh/crore, area units, +91 numbers, IST dates

supabase/migrations/   version-controlled schema, RLS and RPCs
types/database.types.ts  generated schema contract
```

---

## Security notes

- The **service-role key never reaches the browser.** `lib/supabase/admin.ts` throws if
  constructed client-side, and `getServerEnv()` throws if called in a browser context.
- **RLS is on for every table.** Tables that represent money (`contact_unlocks`, `payments`,
  `leads`) grant `SELECT` only; a command with no policy is denied.
- **Views are locked down explicitly.** Supabase's default privileges grant `ALL` on new
  objects in `public`; single-table views are auto-updatable, so each view revokes everything
  and grants back only `SELECT`.
- **Privilege escalation is blocked by triggers, not just policies.** RLS is row-level, so a
  "update your own profile" policy would otherwise permit `role = 'admin'`.
- **Storage writes are scoped by path.** Objects live at `properties/<property_id>/<file>` and
  the policy derives ownership from the key.

---

## Migration order

| File | Contents |
| --- | --- |
| `…090000_extensions_and_enums` | `pg_trgm`, every domain enum |
| `…090100_core_helpers` | `updated_at`, IST day boundaries, `app_settings`, area conversion |
| `…090200_profiles` | profiles, auth trigger, role guard, public seller view |
| `…090300_properties` | listings, indexes, slug/derived fields, moderation guard |
| `…090400_property_media` | images (+ cover maintenance), amenities |
| `…090500_engagement` | saved properties, de-duplicated view tracking |
| `…090600_notifications_and_reports` | notifications, property reports |
| `…090700_contact_unlocks_payments_leads` | the commercial core |
| `…090800_catalog` | locations, categories, amenity vocabulary, verification queue |
| `…090900_row_level_security` | every RLS policy + the two curated cross-user views |
| `…091000_contact_unlock_rpc` | daily quota, unlock decision, order creation, settlement |
| `…091100_storage` | buckets and object policies |
| `…091200_moderation_and_lifecycle` | admin approve/reject, 90-day expiry, renewal |

---

## Working against a hosted project

Migrations go through the CLI (`npm run db:push`). Demo content does not — seeds
only run on a local `db reset`, and writing straight into `auth.users` is the wrong way
to create accounts on a real project. These three scripts use the supported paths
instead, and all are idempotent:

```bash
npm run db:seed:remote     # 4 demo accounts + 6 listings, approved via the real admin RPC
node --env-file=.env.local scripts/seed-images.mjs   # generates + uploads listing photography
npm run db:verify:remote   # ~20 assertions over HTTPS holding only the anon key
```

`scripts/seed-images.mjs` renders stylised architectural PNGs (hand-rolled encoder, no
dependencies) and uploads them to the `property-images` bucket. Stock photography is not
an option here — licensing aside, the CSP and the Next image allow-list only permit the
Supabase bucket.

`scripts/combined-migrations.sql` concatenates every migration for pasting into the
Dashboard SQL Editor, for when the CLI cannot be authenticated. **Using it leaves
Supabase's `schema_migrations` empty**, so a later `db push` will fail on "already
exists" until `supabase migration repair --status applied` is run.

---

## Verifying the business rules

`supabase/tests/business_rules.sql` asserts all ten business rules against a real Postgres —
the daily quota, the IST reset boundary, the ₹9 price, the no-double-charge index, the
no-client-writes policies, and the privacy of seller phone numbers. It aborts on the first
failure.

```bash
npm run db:verify     # resets the database, applies every migration, runs 25 assertions
```

`supabase/seed.sql` creates a demo seller, agent, buyer and admin plus six published
listings. Listings are inserted as `pending` and approved through the real
`admin_approve_property()` RPC under the admin's identity, so the seed exercises the same
moderation path production does.

---

## Roadmap

**Built** — project setup; Supabase clients; full schema, RLS and RPCs (verified against
Postgres); Google auth; profile completion; application shell and home page; property CRUD
with the 7-step posting wizard and direct-to-Storage image uploads; search with the full
filter set, six sort modes and pagination; the property detail page with the Unlock Contact
CTA; saved properties; property reporting; sitemap and robots.

**Next** — the seller lead inbox and analytics (§11, §15), the admin console (§16),
verification review (§14), and the in-app notification UI (§19).

---

## Payments (§7)

Razorpay, behind a provider-agnostic interface in `lib/payments/`. Swapping gateway means
writing one adapter; nothing above that directory knows the provider exists.

Razorpay Checkout is what delivers the UPI experience — a QR to scan on desktop, a hand-off
to GPay/PhonePe/Paytm on mobile — while still producing an order that can be verified. A raw
`upi://` deep link or a static QR to a personal VPA cannot be: the money moves bank to bank,
your server is never told, and the only "confirmation" available is the buyer's word, which
Rule 7 forbids.

**Two verification paths, because one is not enough.**

| | When it runs | Needs a public URL |
| --- | --- | --- |
| `verifyUnlockPayment()` | buyer returns from checkout | no — works on localhost |
| `/api/webhooks/razorpay` | buyer closed the tab mid-payment | yes |

Without the webhook, someone who pays in GPay and then closes the browser is charged with
the contact still locked. Both routes settle through `settle_paid_contact_unlock()`, which is
idempotent — whichever arrives first wins and the other is a no-op, so gateway retries cannot
double-grant or double-charge. That is asserted by `npm run db:verify:remote`.

The browser never reports an outcome. It can ask the server to re-check a payment id; the
amount, the status and the gateway payment id all come from an authenticated server-side call.

**Setup**

1. Razorpay Dashboard → *API Keys* → set `PAYMENT_PROVIDER_KEY` (`key_id`) and
   `PAYMENT_PROVIDER_SECRET` (`key_secret`), then `PAYMENT_PROVIDER=razorpay`.
2. Razorpay Dashboard → *Webhooks* → `https://<domain>/api/webhooks/razorpay`, events
   `payment.captured` and `order.paid`. Put the signing secret in `PAYMENT_WEBHOOK_SECRET`.
3. `GET /api/webhooks/razorpay` reports `{ configured: true }` once the provider loads.

`PAYMENT_PROVIDER=mock` treats every order as paid so the flow can be exercised without an
account. It throws on `NODE_ENV=production` — a mis-set variable on a live deployment would
otherwise give away every paid contact silently.
