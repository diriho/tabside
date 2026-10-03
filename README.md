# TABSide

**Skip the waiter for ordering, keep them for service.**

TABSide is QR-code table ordering built around a shared, running tab:

- **Guests** scan the code on their table, join that table's tab (no app, no account) and order rounds from their phones all evening. They watch each order's status live, then pay online or ask for the check.
- **The kitchen** sees tickets arrive in real time.
- **Waitstaff** see which tables need them.
- **Managers** see the whole restaurant at a glance.

Built with React + Vite + TypeScript, Supabase (Postgres, Auth, Row Level Security, Realtime, Storage), a small Node API for Stripe and staff accounts, and Tailwind CSS.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data model, security model, realtime design and payment flow.

---

## Quick start (local)

**Requirements:**
- Node 22.18+ (Node 26 tested)
- Docker (Docker Desktop or OrbStack)
- The Stripe CLI, only for online payments

```bash
npm install
npm run db:start      # starts local Supabase (first run pulls images, a few minutes)
npm run db:reset      # applies migrations + loads the demo seed
cp .env.example .env.local   # then fill in values (see below)
npm run dev           # web on http://localhost:5173, API on http://localhost:8787
```

`npm run db:start` prints the local keys. Put these in `.env.local`:

| Variable | Where it's used | Local value |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | `http://127.0.0.1:54321` |
| `VITE_SUPABASE_ANON_KEY` | browser | the **publishable** key printed by `supabase start` |
| `SUPABASE_URL` | API | `http://127.0.0.1:54321` |
| `SUPABASE_SECRET_KEY` | API only | the **secret** key printed by `supabase start` |
| `APP_URL` | API (Stripe return URLs) | `http://localhost:5173` |
| `STRIPE_SECRET_KEY` | API only | `sk_test_…` from the Stripe dashboard (optional) |
| `STRIPE_WEBHOOK_SECRET` | API only | `whsec_…` printed by `npm run stripe:listen` (optional) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | browser | `pk_test_…` (optional) |
| `VITE_PUBLIC_APP_URL` | browser (QR codes) | the public origin printed on QR codes |

Never put a secret key in a `VITE_` variable. Those are bundled into the browser.

`.env` and `.env.*` are git-ignored, except `.env.example`.

### Demo accounts

All demo accounts use the password `tabside-demo`.

| Email | Role |
|---|---|
| `manager@theglobe.test` | The Globe: owner / manager |
| `kitchen@theglobe.test` | The Globe: kitchen |
| `waiter@theglobe.test` | The Globe: waitstaff |
| `manager@cafeubuntu.test` | Café Ubuntu: manager (BIF, VAT-inclusive prices) |

In development, the sign-in page has one-tap buttons for these accounts.

## Testing on your phone

```bash
npm run dev:lan
```

This makes the app reachable from other devices on your Wi‑Fi, puts your computer's network address into every QR code, and prints a scannable code for The Globe's Table 3 in the terminal. Scan it with your phone's camera.

- Use `VITE_SUPABASE_URL=/supabase` (the default in `.env.local`). The dev server then proxies Supabase, including realtime, so the phone only needs to reach one address.
- Some networks (campus or office Wi‑Fi) block devices from reaching each other. In that case, open a temporary public URL with `npx cloudflared tunnel --url http://localhost:5173` and use the printed `https://….trycloudflare.com` address on your phone. For printed QR codes to use it, start with `VITE_PUBLIC_APP_URL=<that address> npm run dev:lan`.
- Only run `dev:lan` while you're testing: it exposes the dev server to your network.

## The demo, step by step

1. Open the landing page, http://localhost:5173/r/the-globe. It shows the rating, opening hours and featured reviews.
2. Tap **View menu**.
3. Open a table's QR URL. Table 3 is http://localhost:5173/r/the-globe/table/a0000000-0000-4000-8000-000000000003. The home page and **Admin → Tables & QR codes** list every table's link and code.
4. Choose the party size and tap **Join Table 3**.
5. Add items. The burger asks for a doneness and offers extras; the wine and pizza have sizes.
6. **Review order** shows the database-calculated tax, then **Place order**.
7. Open the same table URL in a second browser or a private window.
8. That browser shows *"You're joining Table 3 — 1 phone is already on this table's tab."* Join.
9. Place another order from the second browser.
10. Both browsers' **Orders** tab now shows round 1 (*You*) and round 2 (*Guest 2*) on one tab.
11. In a third window, sign in as **Kitchen** (`/login`). Tickets appear on `/staff/orders` without refreshing.
12. On a ticket, tap **Accept**, then **Start preparing**.
13. Tap **Mark ready**.
14. The guest's status tracker updates live, and a toast reads *"Your order is ready"*.
15. As a guest, open **Bill**, choose card or cash, and tap **Ask for the check**. The floor (`/staff/tables`) flags the table *Bill requested*.
16. Pay, either way:
    - **Online:** tap **Pay … now** and use Stripe test card `4242 4242 4242 4242`, any future expiry and any CVC. See [Stripe test mode](#stripe-test-mode).
    - **At the table:** sign in as Waitstaff, open the table, choose **Card** or **Cash**, then **Confirm payment**.
17. The guest sees **Payment successful** with the total paid.
18. Tap **Rate your visit** and leave a review.
19. As the Manager, open **Admin → Reviews** and **Feature** or **Hide** the review. The public page updates; the average rating counts every rating, hidden or not.

The manager dashboard (`/admin`) leads with today's revenue, the live floor, and kitchen and bill counts. **Analytics** shows revenue by day, peak hours, average order value and best sellers.

## Stripe test mode

1. Copy your test keys from https://dashboard.stripe.com/test/apikeys into `.env.local` (`STRIPE_SECRET_KEY=sk_test_…`, `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_…`).
2. In another terminal, run `npm run stripe:listen` and paste the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.
3. Restart `npm run dev`.

How a payment flows:

1. The guest taps **Pay**.
2. The API verifies the guest's JWT, asks the database what's due, records a pending payment and creates a Stripe Checkout Session.
3. The guest pays on Stripe's hosted page.
4. Stripe sends a signed `checkout.session.completed` webhook. The API verifies the signature and settles the payment idempotently, checking the amount and currency.
5. The table becomes paid, and realtime updates every phone at the table.

If the guest gets back from Stripe before the webhook arrives, the bill page asks the API to verify with Stripe directly.

Without Stripe keys, **Pay online** is hidden and **Ask for the check** still works.

## Deploying to your hosted Supabase project

```bash
npx supabase link --project-ref <your-project-ref>   # asks for the database password
npx supabase db push                                  # applies supabase/migrations
```

Then, in the Supabase dashboard:

- **Authentication → Sign In / Providers**: enable **Anonymous sign-ins** (this is how guests get an identity without an account).
- **Authentication → URL Configuration**: set **Site URL** and redirect URLs to your app's origin.

Seed data (`supabase/seed.sql`) is for local demos only; don't push it to production.

Next, set the environment variables on your hosts:

- **Web app:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PUBLIC_APP_URL`.
- **Node API:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`.

Serve the web app and the API under the same origin, with `/api/*` going to the API. Otherwise, set `APP_URL` so the API's CORS allows the web origin.

Finally, add a Stripe webhook endpoint at `https://<your-origin>/api/stripe/webhook` for these `checkout.session.*` events:
- `completed`
- `async_payment_succeeded`
- `async_payment_failed`
- `expired`

## Tests

```bash
npm run test:unit   # money, tax engine, currencies, Stripe amounts, opening hours, UI components (jsdom)
npm run test:db     # against local Supabase: sessions, orders, RLS, payments, reviews, webhooks, TS↔SQL tax parity
npm run test:e2e    # Playwright: the full acceptance flow in real browsers (needs `npm run dev` or starts it)
npm test            # unit + ui + db
npm run typecheck
```

What the suites cover:

- **Shared table sessions:** six phones scanning one table at once still produce one tab.
- **Pricing on the server:** prices always come from the database, never the client. Variants and modifier rules are validated.
- **Order lifecycle:** status moves forward only, with role-limited cancellation and voids that re-total the order.
- **Money:** tax rules (inclusive, exclusive, category- and item-scoped), zero-decimal currencies, and parity between the TypeScript cart preview and the SQL engine over 300 random carts.
- **Bills and payments:** manual payments, Stripe webhook signature checks, amount-mismatch rejection, idempotency and expiry.
- **Isolation:** RLS between guests, between restaurants, and between staff roles.
- **Reviews:** moderation, plus the guarantee that managers can't edit ratings.
- **Restaurant deletion:** soft delete only.

The optional Stripe Checkout E2E test runs when `STRIPE_SECRET_KEY` is set.

## Project layout

```
src/
  app/          router, providers, route guards
  components/   ui primitives, menu, orders, tables, charts, layout
  features/     guest/ staff/ admin/ public/ auth/
  hooks/        auth, cart, realtime, theme, toast
  lib/          supabase client, API client, errors, QR, time
  services/     typed data access per domain
  types/        generated database types + domain types
shared/         money, tax engine, Stripe amounts, opening hours (browser + server + tests)
server/         Node API: Stripe Checkout + webhook, staff accounts
supabase/       config, migrations, seed
tests/          unit/, ui/, db/, e2e/
```

Regenerate the database types after changing migrations with `npm run db:types`.
