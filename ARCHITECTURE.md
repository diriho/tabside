# TABSide — Architecture

> Skip the waiter for ordering, keep them for service.

TABSide is a QR-code table-ordering platform built around a **persistent, shared table session** (a running tab). Guests scan a table's QR code, join that table's open session, and order from their phones as often as they like. Kitchen and waitstaff work the orders, and managers see the whole restaurant live.

---

## 1. System overview

```
 ┌──────────────────────────┐        ┌───────────────────────────────┐
 │  React SPA (Vite, TS)    │──JWT──▶│  Supabase                     │
 │  • Guest (mobile)        │        │  • Postgres + RLS             │
 │  • Staff (tablet)        │◀─WS───▶│  • Auth (email + anonymous)   │
 │  • Admin (desktop)       │        │  • Realtime (postgres_changes)│
 └──────────┬───────────────┘        │  • Storage (images, PDF menus)│
            │ /api (JWT)             └──────────────▲────────────────┘
 ┌──────────▼───────────────┐   service role key    │
 │  Node API (server/)      │───────────────────────┘
 │  • Stripe Checkout       │
 │  • Stripe webhook        │◀──── Stripe (signed webhooks)
 │  • Staff account admin   │
 └──────────────────────────┘
```

- **The browser talks to Supabase directly** for reads, realtime and RPCs. Every request carries the user's JWT, and RLS plus `SECURITY DEFINER` RPCs enforce what it may do.
- **The API exists only for things that need secrets.** That means Stripe (secret key, webhook signature) and creating staff auth accounts (service-role key). It never trusts IDs from the client. It verifies the caller's JWT and re-checks membership in the database.
- **One handler, two runtimes.** `createHandler()` in `server/app.ts` is a plain `(req, res)` handler. Locally it runs inside a Node HTTP server behind the Vite proxy (`server/index.ts`). On Vercel the same handler is bundled into a serverless function (`server/vercel.ts`).
- **Business rules live in Postgres:** pricing, tax, order transitions and session state. They hold regardless of which client calls.

## 2. Roles & identity

| Role | Identity | Scope |
|---|---|---|
| **Guest** | Supabase **anonymous auth user** created silently on first scan. No account or forms. | Only the table session(s) they joined. |
| **Kitchen** | Email/password user + `staff_members(role='kitchen')` | One restaurant: orders, availability. |
| **Waiter** | Email/password user + `staff_members(role='waiter')` | One restaurant: orders, tables, bill requests, manual payments. |
| **Manager** | Email/password user + `staff_members(role='manager')` | One restaurant: everything, including menu, prices, staff and reviews. |

- Anyone with a real account can **create a restaurant** (`create_restaurant` RPC) and becomes its owner-manager. Managers add staff through the Node API, which creates the auth user with a temporary password.
- Anonymous users can never hold a staff role. Staff policies require a non-anonymous JWT (`is_anonymous = false`).

## 3. Data model

```
restaurants ─┬─ restaurant_tables ── table_sessions ─┬─ session_guests
             │                                        ├─ orders ─┬─ order_items
             │                                        │          ├─ order_taxes
             │                                        │          └─ order_status_history
             │                                        ├─ table_requests (bill / waiter)
             │                                        ├─ payments
             │                                        └─ reviews
             ├─ menu_categories ── menu_items ─┬─ menu_item_variants
             │                                 └─ menu_modifier_groups ── menu_modifiers
             ├─ taxes ─┬─ tax_categories / tax_items (scope)
             ├─ staff_members ── profiles (auth.users)
             ├─ availability_reports
             ├─ notifications ── notification_reads
             └─ restaurant_review_settings
currencies (ISO code, minor-unit exponent)
```

### The shared table session (core invariant)
- **One active session per table.** This is enforced by a partial unique index on `table_sessions(table_id) WHERE status IN ('open','bill_requested','paid')`.
- `join_table(table_id, party_size)` is atomic. It returns the existing active session or opens a new one, then adds the caller as a `session_guest` (idempotent per user). Every phone at Table 12 lands in the **same** session.
- **Orders keep their provenance.** Each order belongs to `session_id` and `guest_id`, and carries a restaurant-wide `order_number` (#1042) and a per-table `session_seq` (1st, 2nd… round). Nothing is merged into an anonymous blob. Staff see orders grouped by table, in sequence, each with its own status.
- The session lifecycle is `open → bill_requested → paid → closed`. Guests may keep ordering while a session is `open` or `bill_requested`. A settled (`paid`) session is closed automatically when a new party joins the table, or by staff ("Clear table").

### Orders
- Lifecycle: `pending → accepted → preparing → ready → delivered`, plus `cancelled` from any pre-delivered state.
  - Transitions only move forward, and a step may be skipped (e.g. `pending → preparing`).
  - A trigger validates every change and writes `order_status_history`, so nothing bypasses it.
- `place_order(session_id, items[], notes)` is the only way to create an order. It:
  1. verifies the caller is a guest of that session and the session is orderable;
  2. checks that the restaurant is active, ordering is enabled, and every item, variant and modifier is available;
  3. **reads prices from the database**, computes taxes, and snapshots names and prices into `order_items`;
  4. assigns `order_number` and `session_seq`, then emits notifications.
- Staff can **void a line** whose item ran out after ordering. The order is re-totalled and the guest is notified.

### Money
- All amounts are **integer minor units** (`bigint`), with the currency stored explicitly on the restaurant, order and payment. `currencies.exponent` follows ISO 4217 (USD 2, BIF 0, KES 2).
- **Tax rules:** each tax has a name, a `rate_bps` (basis points; 16% = 1600, 7.25% = 725), an `is_inclusive` flag, and a scope (all items, chosen categories, or chosen items).
- **Tax calculation**, per order line, with half-up integer rounding:
  - **Inclusive taxes:** `net = round(line × 10000 / (10000 + Σ inclusive rates))`. Each inclusive tax gets its share of `line − net`, and the last tax absorbs the rounding remainder.
  - **Exclusive taxes:** `round(net × rate / 10000)`.
  - **Totals:** `total = subtotal + Σ exclusive tax`. Inclusive tax is reported but already contained in the subtotal.
- The same algorithm exists in TypeScript (`src/lib/money/`) for the live cart preview. Tests assert that the TS and SQL implementations agree, and the **database result is authoritative**.

### Payments
- `payments` stores one row per attempt: method (`stripe | cash | card | other`), status (`pending | succeeded | failed | cancelled`), amount and currency.
- The amount due is computed by the database: `Σ non-cancelled order totals − Σ succeeded payments`.
- When succeeded payments cover the total, the session becomes `paid`, open bill requests are resolved, and staff and guests are notified.

### Reviews
- A guest can leave one review per session, and only once the session is `paid` or `closed`. A review has a 1–5 star rating and optional text.
- The rating aggregates (`rating_count`, `rating_sum`) are maintained on `restaurants` by trigger.
- Managers moderate only through `moderate_review(is_hidden, is_featured)`. They have no update rights on `rating` or `body`. Hidden reviews still count toward the average, but their text is never public.

### Restaurant closure
- **Soft only.**
  - `status = 'closed'` stops new sessions and orders but still lets open tabs be paid. A closed restaurant can be reopened.
  - `deleted_at` hides the restaurant publicly, and orders and payments are preserved.
- Both actions require typed confirmation in the UI.

## 4. Security model (RLS)

**Helper functions** (`SECURITY DEFINER`, `search_path` pinned):
- `is_staff(restaurant_id, roles[])`
- `is_session_guest(session_id)`
- `is_anon()`

| Data | Public (anon) | Guest | Staff | Manager |
|---|---|---|---|---|
| Active restaurant profile, tables (id/label), menu, taxes, public reviews | read | read | read | read/write |
| `table_sessions`, `session_guests`, `orders`, `order_items`, `table_requests`, `payments` | — | **own session only** (read) | own restaurant (read) | own restaurant (read) |
| Order status, availability, voids | — | — | RPC only | RPC only |
| Menu, prices, taxes, tables, settings | — | — | read | write |
| `staff_members` | — | — | read (own restaurant) | write (via RPC / API) |
| Notifications | — | session-addressed | role-addressed | all for restaurant |

- **Writes that carry business rules go through RPCs**: ordering, status, payments, requests and moderation. Tables that hold them have **no** `INSERT/UPDATE` policies for clients. The RPCs re-derive restaurant and session ownership from `auth.uid()` and never trust client IDs.
- **Prices cannot be changed by kitchen or waiter users.** Menu write policies require `manager`. The staff availability RPC can only toggle `available ↔ sold_out`.
- **Secrets stay server-side.** The Stripe secret key, webhook secret and Supabase service-role key live only in the Node server's environment. The browser gets only the Supabase URL, the anon/publishable key and the Stripe publishable key.

## 5. Realtime

- The tables in the `supabase_realtime` publication are `orders`, `order_items`, `table_sessions`, `session_guests`, `table_requests`, `payments`, `menu_items` and `notifications`. Postgres-changes subscriptions are filtered by `restaurant_id` (staff) or `session_id` (guests), and RLS applies per subscriber.
- **Pattern: events are invalidation signals.** A change event invalidates the relevant TanStack Query keys, and the client refetches the authoritative view or RPC (e.g. `get_table_board`). This avoids drift from patching partial rows client-side and stays correct across reconnects: on reconnect everything is refetched.
- **Catch-up refetches.** Realtime can report a channel as subscribed before its replication stream is running; it starts lazily after an idle period. Every (re)subscribe therefore triggers an immediate refetch plus two one-off catch-up refetches at about 4s and 10s. This was found by a test that ran right after a database reset, and it keeps the first order of the day from being missed.
- There is no polling.

## 6. Payments (Stripe)

```
Guest ─POST /api/payments/checkout {sessionId} + JWT─▶ Node API
  Node API: verify JWT → verify guest ∈ session → amount_due from DB
            → insert payments(pending) → Stripe Checkout Session (metadata: payment_id)
  ◀─ { url } ── redirect to Stripe Checkout (test mode)
Stripe ─checkout.session.completed (signed)─▶ POST /api/stripe/webhook
  Node API: verify signature → record_stripe_payment(payment_id, …) [service role]
            → payments.succeeded → session.paid → notifications → Realtime
Guest returns to /session/:id/bill?checkout=success and sees the realtime-confirmed state.
```

- **Idempotency.** The webhook handler is idempotent: payment rows are keyed by Stripe IDs and duplicate events are no-ops.
- **Zero-decimal and special currencies** are mapped in one place (`toStripeAmount`). BIF, for example, is zero-decimal on Stripe and has exponent 0 in ISO 4217, so amounts pass through unchanged.
- **Manual payments.** For cash, card terminal or other methods, waitstaff or a manager confirms explicitly through `record_manual_payment`. A session is never marked paid without that confirmation or a verified webhook.

## 7. Routing

| Path | Who | Purpose |
|---|---|---|
| `/` | public | Product home |
| `/r/:slug` | public | Restaurant landing (rating, hours, info, featured reviews) |
| `/r/:slug/menu` | public | Menu (HTML or PDF) |
| `/r/:slug/table/:tableId` | guest | QR entry → confirm table & party size → join |
| `/session/:sessionId` | guest | Menu with ordering + sticky cart |
| `/session/:sessionId/order` | guest | Cart review → place order |
| `/session/:sessionId/orders` | guest | Table's orders and live status |
| `/session/:sessionId/bill` | guest | Bill, request check, pay online |
| `/session/:sessionId/review` | guest | Rate the visit |
| `/login`, `/signup`, `/onboarding` | staff | Auth, and creating a restaurant |
| `/admin` (+ `restaurant`, `menu`, `tables`, `staff`, `orders`, `reviews`, `analytics`) | manager | Management |
| `/staff` (+ `orders`, `tables`, `menu`) | kitchen/waiter/manager | Operations |

## 8. Code layout

```
src/
  app/          router, providers, route guards
  components/   ui/ (design-system primitives), shared feature components
  features/     guest/, staff/, admin/, public/, auth/ — pages + feature components
  hooks/        realtime, auth, session hooks
  lib/          supabase client, money/ (currency + tax), query client, utils
  services/     typed data access (one module per domain)
  types/        database + domain types
server/         Node API (Stripe checkout + webhook, staff admin)
supabase/       config, migrations/, seed.sql
tests/          unit (money/tax), db integration (RLS, sessions, orders), ui, e2e
```

## 9. Deployment & environments

| Environment | Web app | API | Database |
|---|---|---|---|
| Local development | Vite dev server | Node server on `127.0.0.1:8787`, reached via the Vite `/api` proxy | **hosted** Supabase project |
| Production / previews | Vercel CDN | one Vercel function (`nodejs22.x`), mounted at each `/api/...` path | **hosted** Supabase project |
| Integration tests | Vite on `:5174` (Playwright) | Node on `:8788` | disposable **local** Supabase (Docker), guarded to `localhost` only |

- **Build:** `npm run build:vercel` typechecks, builds the SPA, and bundles the API with Rolldown into one self-contained ESM file. It then emits `.vercel/output` (Build Output API v3).
- **Routing** (`config.json`):
  - immutable caching for `/assets/*`;
  - security headers on everything;
  - filesystem, then functions;
  - 404 for unknown `/api/*`;
  - SPA fallback to `index.html`.
- **Function mounting:** the function is symlinked at every path in `API_ROUTES`, so `req.url` is always the real path.
- **Security headers:**
  - **CSP:** `script-src 'self'` with no inline scripts (the theme bootstrap is `public/theme-init.js`); `connect-src` limited to the exact Supabase project (https + wss); fonts only from Google Fonts; images from https.
  - **Others:** HSTS, `nosniff`, `X-Frame-Options: DENY` with `frame-ancestors 'none'`, a strict referrer policy and a permissions policy.
- **`APP_URL` on Vercel** defaults to `VERCEL_PROJECT_PRODUCTION_URL` (production) or `VERCEL_URL` (previews). Stripe's return URLs and CORS need no extra configuration.
- **Hosted auth settings** live in `supabase/config.toml` under `[remotes.production]`: anonymous sign-ins on, a guest sign-in limit for shared venue Wi‑Fi, and email confirmation and TOTP kept on. Review them with `supabase config diff`.
- **Demo data:** `npm run seed:demo` loads The Globe into a chosen owner account on the hosted project, using the service-role key. It computes totals with the shared tax engine, which is verified identical to the SQL engine. `supabase/seed.sql` (with public demo logins) is for the local test database only.

