# TABSide

**Skip the waiter for ordering, keep them for service.**

TABSide is QR-code table ordering built around a shared, running tab:

- **Guests** scan the code on their table, join that table's tab (no app, no account) and order rounds from their phones all evening. They watch each order's status live, then pay online or ask for the check.
- **The kitchen** sees tickets arrive in real time.
- **Waitstaff** see which tables need them.
- **Managers** see the whole restaurant at a glance.

Built with React + Vite + TypeScript, hosted **Supabase** (Postgres, Auth, Row Level Security, Realtime, Storage), a small API for Stripe and staff accounts, and Tailwind CSS. It deploys to **Vercel**: the app on the CDN, the API as one serverless function.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data model, security model, realtime design and payment flow.

---

## How it runs

```
Browser ──────────────► Supabase (hosted): data, auth, realtime, storage — protected by RLS
   │
   └── /api/* ────────► API: Stripe Checkout + webhook, staff accounts (needs secret keys)
                         local: Node server via the Vite proxy · Vercel: serverless function
```

There's no local database or container in the app's path: development and production both use your hosted Supabase project.

## Run it locally

**Requirements:** Node 22.18+ (Node 26 tested). The Stripe CLI is only needed for online payments.

```bash
npm install
cp .env.example .env.local    # fill in your Supabase project's URL and keys (see below)
npm run dev                   # app on http://localhost:5173, API on http://localhost:8787
```

| Variable | Used by | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | browser | the project's **publishable** key |
| `SUPABASE_URL` | API | same URL |
| `SUPABASE_SECRET_KEY` | API only | the project's **secret** key |
| `SUPABASE_PUBLISHABLE_KEY` | API | the publishable key |
| `APP_URL` | API | `http://localhost:5173` locally; on Vercel it defaults to your domain |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | API only | optional, see [Stripe](#stripe-test-mode) |
| `VITE_PUBLIC_APP_URL` | browser | optional: origin printed in QR codes |

Never put a secret key in a `VITE_` variable; those are bundled into the browser. All `.env*` files except `.env.example` are git-ignored.

### One-time setup of the Supabase project

1. **Schema:** `npx supabase link --project-ref <ref>`, then `npx supabase db push` (applies `supabase/migrations`).
2. **Guests need anonymous sign-ins:** in the dashboard, go to **Authentication → Sign In / Providers** and turn on **Allow anonymous sign-ins**.
3. **Rate limit for guests:** in **Authentication → Rate Limits**, raise **anonymous sign-ins** to about 300 per hour. Guests in one venue often share its Wi‑Fi address, and the default of 30 runs out on a busy night.
4. **URLs:** in **Authentication → URL Configuration**, set **Site URL** to your production address and add it to **Redirect URLs**. Keep `http://localhost:5173/**` there for local work.

`supabase/config.toml` holds the same production values under `[remotes.production]`. A project admin can apply them with `npx supabase config push`; preview first with `npx supabase config diff`.

### Load the demo restaurant into your account

```bash
npm run seed:demo
```

It asks for your email. If you have no account yet, it also asks for a password and creates the account, already confirmed. It then adds **The Globe** to your account: menu with sizes and extras, five tables, sales and liquor tax, two weeks of paid order history and reviews. You become its owner-manager. It never overwrites anything; if `/r/the-globe` is taken, use `--slug another-name`.

## Deploy to Vercel

1. Push the repo to GitHub, then in Vercel choose **Add New → Project** and import it. `vercel.json` sets the build; leave the framework preset as **Other**.
2. Under **Settings → Environment Variables** (Production and Preview), add:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`
   - optionally `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `VITE_PUBLIC_APP_URL` (for a custom domain)
3. **Deploy.** Then put the production URL into Supabase's **Site URL** and **Redirect URLs** (step 4 above).
4. **Stripe (optional):** add a webhook endpoint `https://<your-domain>/api/stripe/webhook` with these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`

   Copy its signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.

### What the build produces

`npm run build:vercel` produces Vercel's [Build Output API](https://vercel.com/docs/build-output-api) in `.vercel/output`:

- **Static site:** the app on the CDN, with hashed assets cached forever and a fallback to `index.html` for in-app routes.
- **API function:** one self-contained `nodejs22.x` function, mounted at every `/api/...` path. Unknown `/api` paths return 404.
- **Security headers:** a Content-Security-Policy pinned to your Supabase project, HSTS, `nosniff`, `frame-ancestors 'none'`, a referrer policy and a permissions policy.

Every push redeploys, and pull requests get preview URLs.

## Stripe test mode

1. Put your test keys from https://dashboard.stripe.com/test/apikeys into `.env.local` (`STRIPE_SECRET_KEY=sk_test_…`).
2. Run `npm run stripe:listen` in another terminal and copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.
3. Restart `npm run dev`.

How a payment flows:

1. The guest taps **Pay**.
2. The API checks the guest's login, asks the database what's due, and creates a Stripe Checkout Session.
3. Stripe sends a signed webhook.
4. The API verifies the signature and settles the payment idempotently, checking amount and currency.
5. Every phone at the table updates live.

Without Stripe keys, **Pay online** is hidden and **Ask for the check** still works. Test card: `4242 4242 4242 4242`, any future date, any CVC.

## Try it

1. Sign in at `/login` and open **Admin**. With the demo loaded, you'll see the dashboard, menu, tables and reviews.
2. **Admin → Tables & QR codes:** tap **QR code** on a table and scan it with your phone. On a deployed site that just works. Locally, see [Testing on your phone](#testing-on-your-phone).
3. On the phone, join the table and order.
4. Open the same table on a second phone or a private window; both share one tab.
5. In another window, sign in to **Kitchen** (`/staff/orders`). Tickets appear live.
6. Accept, prepare and mark ready. The guest's tracker updates live.
7. The guest opens **Bill**, then either pays online or taps **Ask for the check**. Waitstaff confirm cash or card from **Tables**.
8. After paying, the guest can rate the visit. Moderate reviews in **Admin → Reviews**.

To try the staff views, add kitchen and waitstaff accounts in **Admin → Staff**.

## Testing on your phone

- **Simplest:** deploy to Vercel and scan the codes from the deployed admin.
- **Locally:**
  - **Same Wi‑Fi:** `npm run dev:lan` makes the app reachable at your computer's network address, puts that address into the QR codes, and prints a scannable code. Run it only while testing.
  - **Networks that block devices from reaching each other:** use a tunnel with `npx cloudflared tunnel --url http://localhost:5173`, then open the admin through the tunnel's `https://` address so the codes use it. Check your network's rules first; campus networks may not allow tunnels.
- **QR codes that point at `localhost`:** the admin warns you when this happens. They only work on the computer itself.

## Tests

```bash
npm test             # unit + component tests (no database needed)
npm run typecheck
```

The **database and browser tests** create and delete data, so they run only against a disposable **local** Supabase. That local copy needs Docker or OrbStack. They refuse to run against anything that isn't `localhost`, and they never read your `.env.local`:

```bash
npm run db:start     # start local Supabase for tests; writes .env.test.local
npm run db:reset     # schema + local demo seed
npm run test:db      # sessions, orders, RLS, payments, reviews, webhooks, TS↔SQL tax parity
npm run test:e2e     # the full guest → kitchen → payment → review flow in Chromium (own ports 5174/8788)
npm run db:stop      # stop the containers when done
```

What the suites cover:

- **Shared table sessions:** six phones scanning one table at once still produce one tab.
- **Pricing:** prices come from the database, never the client.
- **Order lifecycle:** status only moves forward, cancellation is limited by role, and voids re-total the order.
- **Money:** tax rules, zero-decimal currencies, and TypeScript↔SQL tax parity over 300 random carts.
- **Payments:** Stripe webhook signatures, amount checks, idempotency and expiry.
- **Isolation:** RLS keeps guests, restaurants and staff roles apart.
- **Reviews:** managers can moderate but never edit a rating.
- **Restaurant deletion:** soft delete only.

The Stripe Checkout browser test runs when `STRIPE_SECRET_KEY` is set.

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
server/         API: Stripe Checkout + webhook, staff accounts; vercel.ts is the serverless entry
scripts/        dev runner, Vercel build, demo seed, local test DB
supabase/       config (incl. production overrides), migrations, local test seed
tests/          unit/, ui/, db/, e2e/
```

After changing migrations, regenerate the database types with `npm run db:types` (from the local test DB) and push the migrations with `npx supabase db push`.
