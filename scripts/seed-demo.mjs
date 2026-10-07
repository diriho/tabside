// Loads the demo restaurant "The Globe" — menu, tables, taxes and two weeks of order history and
// reviews — into YOUR account on the Supabase project in .env/.env.local (the hosted one).
//
//   npm run seed:demo                     # asks for your email (and a password if the account is new)
//   npm run seed:demo -- --email you@x.com --slug the-globe
//
// Runs with the service-role key, so keep it on your machine. It never deletes anything; if the slug
// is already taken it stops. Your account becomes the restaurant's owner-manager.
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { applicableTaxes, summarizeLines } from '../shared/tax.ts'

const { values: args } = parseArgs({ options: { email: { type: 'string' }, slug: { type: 'string', default: 'the-globe' }, days: { type: 'string', default: '14' } } })

const URL = process.env.SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY
if (!URL || !SECRET) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY (in .env.local) for the project to seed.')
  process.exit(1)
}
const db = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

// ─── Prompts ─────────────────────────────────────────────────────────────────
function ask(question, { hidden = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s) }
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()) }))
}

const host = new globalThis.URL(URL).host
console.info(`Seeding demo restaurant into ${host}`)
const email = (args.email ?? (await ask('Owner email (your account): '))).toLowerCase()
if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('That doesn’t look like an email address.')

const existing = must(await db.from('restaurants').select('id').eq('slug', args.slug).maybeSingle(), 'check slug')
if (existing) {
  console.error(`A restaurant with the address /r/${args.slug} already exists — nothing changed. Use --slug to pick another.`)
  process.exit(1)
}

// ─── Owner account ───────────────────────────────────────────────────────────
let profile = must(await db.from('profiles').select('id, full_name, email').eq('email', email).maybeSingle(), 'find account')
if (!profile) {
  console.info(`No account for ${email} yet — creating one.`)
  const password = process.env.SEED_OWNER_PASSWORD || (await ask('Choose a password (8+ characters): ', { hidden: true }))
  if (password.length < 8) throw new Error('Password must be at least 8 characters.')
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`create account: ${error?.message}`)
  profile = { id: data.user.id, full_name: null, email }
}
const ownerName = profile.full_name || email.split('@')[0]

// ─── Restaurant, menu, taxes ─────────────────────────────────────────────────
const TZ = 'America/Chicago'
const img = (id) => `https://images.unsplash.com/photo-${id}?w=800&q=80&auto=format&fit=crop`
const restaurantId = randomUUID()
must(await db.from('restaurants').insert({
  id: restaurantId,
  slug: args.slug,
  name: 'The Globe',
  tagline: 'Neighbourhood kitchen & bar since 2009',
  description: 'A warm corner spot serving honest, seasonal comfort food — smash burgers, wood-fired pizza, hand-rolled pasta and a short list of natural wines. Order from your table whenever you like; we’ll bring it over.',
  hero_image_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80&auto=format&fit=crop',
  gallery_urls: ['1414235077428-338989a2e8c0', '1559339352-11d035aa65de', '1504674900247-0877df9cc836'].map((id) => `https://images.unsplash.com/photo-${id}?w=1200&q=80&auto=format&fit=crop`),
  address: '914 W Randolph St, Chicago, IL 60607',
  phone: '+1 (312) 555-0142',
  instagram_handle: 'theglobechicago',
  opening_hours: {
    mon: [{ open: '11:30', close: '22:00' }], tue: [{ open: '11:30', close: '22:00' }], wed: [{ open: '11:30', close: '22:00' }],
    thu: [{ open: '11:30', close: '23:00' }], fri: [{ open: '11:30', close: '23:30' }], sat: [{ open: '10:00', close: '23:30' }],
    sun: [{ open: '10:00', close: '21:00' }],
  },
  timezone: TZ,
  currency: 'USD',
  created_by: profile.id,
}), 'create restaurant')
must(await db.from('staff_members').insert({ restaurant_id: restaurantId, user_id: profile.id, role: 'manager', display_name: ownerName, email, is_owner: true }), 'owner')

const tables = [1, 2, 3, 4, 5].map((n) => ({ id: randomUUID(), restaurant_id: restaurantId, label: String(n), capacity: [2, 4, 4, 6, 8][n - 1], sort_order: n }))
must(await db.from('restaurant_tables').insert(tables), 'tables')

const cat = { food: randomUUID(), drinks: randomUUID(), desserts: randomUUID() }
must(await db.from('menu_categories').insert([
  { id: cat.food, restaurant_id: restaurantId, name: 'Food', description: 'From the grill, the oven and the pass.', sort_order: 1 },
  { id: cat.drinks, restaurant_id: restaurantId, name: 'Drinks', description: 'Soft, sparkling, brewed and poured.', sort_order: 2 },
  { id: cat.desserts, restaurant_id: restaurantId, name: 'Desserts', description: 'Worth saving room for.', sort_order: 3 },
]), 'categories')

const menu = [
  ['burger', cat.food, 'Globe Smash Burger', 'Two dry-aged beef patties, American cheese, pickles, shallot jam, brioche bun.', '1568901346375-23c9450c58cd', 1400, ['popular']],
  ['pizza', cat.food, 'Wood-fired Margherita', 'San Marzano tomato, fior di latte, basil, olive oil. 48-hour dough.', '1513104890138-7c749659a591', 1400, ['vegetarian']],
  ['pasta', cat.food, 'Rigatoni alla Vodka', 'Hand-rolled rigatoni, tomato cream, Calabrian chili, parmigiano.', '1621996346565-e3dbc646d9a9', 1650, ['vegetarian', 'spicy']],
  ['caesar', cat.food, 'Little Gem Caesar', 'Little gem lettuce, anchovy dressing, sourdough crumb, aged parmesan.', '1550304943-4f24f54ddde9', 1200, []],
  ['fries', cat.food, 'Crispy Fries', 'Twice-cooked, sea salt, garlic aioli.', '1573080496219-bb080dd4f877', 550, ['vegan']],
  ['wings', cat.food, 'Hot Honey Wings', 'Six wings, hot honey glaze, pickled celery, blue cheese dip.', '1567620832903-9fc6debc209f', 1300, ['spicy']],
  ['coke', cat.drinks, 'Coca-Cola', 'Glass bottle, 355 ml.', '1622483767028-3f66f32aef97', 300, []],
  ['lemonade', cat.drinks, 'House Lemonade', 'Fresh-squeezed lemons, a little mint.', '1621263764928-df1444c5e859', 450, []],
  ['tea', cat.drinks, 'Peach Iced Tea', 'Cold-brewed black tea, white peach.', '1556679343-c7306c1976bc', 400, []],
  ['espresso', cat.drinks, 'Espresso', 'Single-origin, pulled to order.', '1510707577719-ae7c14805e3a', 350, []],
  ['ipa', cat.drinks, 'Local IPA', 'Rotating Chicago IPA on draft, 16 oz.', '1608270586620-248524c67de9', 800, ['alcohol']],
  ['red', cat.drinks, 'House Red', 'Natural Montepulciano, juicy and bright.', '1510812431401-41d2bd2722f3', 1000, ['alcohol']],
  ['cake', cat.desserts, 'Chocolate Olive Oil Cake', 'Dark chocolate, olive oil, flaky salt, crème fraîche.', '1578985545062-69928b1d9587', 700, ['popular']],
  ['cheesecake', cat.desserts, 'Basque Cheesecake', 'Burnt top, creamy centre, seasonal fruit.', '1533134242443-d4fd215305ad', 800, []],
  ['tiramisu', cat.desserts, 'Tiramisu', 'Espresso-soaked savoiardi, mascarpone, cocoa.', '1571877227200-a0d98ea607e9', 850, []],
  ['gelato', cat.desserts, 'Gelato', 'Ask about today’s flavours.', '1501443762994-82bd5dace89a', 450, []],
]
const items = Object.fromEntries(menu.map(([key, category_id, name, description, photo, price_minor, tags], i) => [key, {
  id: randomUUID(), restaurant_id: restaurantId, category_id, name, description, image_url: img(photo), price_minor, tags, sort_order: i + 1,
}]))
must(await db.from('menu_items').insert(Object.values(items), { defaultToNull: false }), 'menu items')

must(await db.from('menu_item_variants').insert([
  [items.pizza, '10"', 1400], [items.pizza, '14"', 1800], [items.red, 'Glass', 1000], [items.red, 'Bottle', 3800],
  [items.gelato, 'One scoop', 450], [items.gelato, 'Two scoops', 700],
].map(([item, name, price_minor], i) => ({ restaurant_id: restaurantId, item_id: item.id, name, price_minor, sort_order: (i % 2) + 1 }))), 'variants')

const groups = { cook: randomUUID(), addons: randomUUID(), upgrade: randomUUID() }
must(await db.from('menu_modifier_groups').insert([
  { id: groups.cook, restaurant_id: restaurantId, item_id: items.burger.id, name: 'Cook', min_select: 1, max_select: 1, sort_order: 1 },
  { id: groups.addons, restaurant_id: restaurantId, item_id: items.burger.id, name: 'Add-ons', min_select: 0, max_select: 3, sort_order: 2 },
  { id: groups.upgrade, restaurant_id: restaurantId, item_id: items.fries.id, name: 'Upgrade', min_select: 0, max_select: 1, sort_order: 1 },
]), 'modifier groups')
must(await db.from('menu_modifiers').insert([
  [groups.cook, 'Medium rare', 0], [groups.cook, 'Medium', 0], [groups.cook, 'Well done', 0],
  [groups.addons, 'Smoked bacon', 250], [groups.addons, 'Extra cheese', 150], [groups.addons, 'Avocado', 200],
  [groups.upgrade, 'Truffle & parmesan', 300],
].map(([group_id, name, price_delta_minor], i) => ({ restaurant_id: restaurantId, group_id, name, price_delta_minor, sort_order: i + 1 }))), 'modifiers')

const taxRows = must(await db.from('taxes').insert([
  { restaurant_id: restaurantId, name: 'Sales tax', rate_bps: 1025, is_inclusive: false, scope: 'all', sort_order: 1 },
  { restaurant_id: restaurantId, name: 'Liquor tax', rate_bps: 300, is_inclusive: false, scope: 'items', sort_order: 2 },
]).select('*'), 'taxes')
const liquor = taxRows.find((t) => t.name === 'Liquor tax')
const taxItems = [items.ipa, items.red].map((i) => ({ tax_id: liquor.id, item_id: i.id, restaurant_id: restaurantId }))
must(await db.from('tax_items').insert(taxItems), 'tax scope')

// ─── History: closed, paid tabs with orders and reviews ──────────────────────
let seed = 42
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const pick = (arr) => arr[Math.floor(random() * arr.length)]

/** Wall-clock time in a timezone → UTC Date. */
function zoned(y, m, d, minutes) {
  const guess = Date.UTC(y, m, d, 0, minutes)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]))
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
  return new Date(guess - (asLocal - guess))
}

const simpleItems = Object.values(items).filter((i) => ![items.pizza, items.red, items.gelato, items.burger].includes(i))
const taxDefs = taxRows
const links = { taxCategories: [], taxItems }
const sessions = []
const orders = []
const orderItems = []
const orderTaxes = []
const payments = []
const reviews = []
let orderNumber = 1001
const now = Date.now()
const days = Number(args.days)
const bodies = [
  'The smash burger lives up to the hype. Ordering from the table was so easy.',
  'Lovely spot, great pasta. Loved being able to add dessert without flagging anyone down.',
  'Warm service and the cheesecake is unreal.',
  'Fast, friendly, and the pizza crust is perfect.',
  'We kept ordering rounds all evening and the tab just worked. Brilliant.',
  'Solid neighbourhood place. Fries are addictive.',
  null, null,
]

for (let back = days; back >= 0; back--) {
  const day = new Date(now - back * 86_400_000)
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(day).split('-').map(Number)
  const count = 6 + Math.floor(random() * 7)
  for (let s = 0; s < count; s++) {
    const openMinutes = random() < 0.38 ? 705 + Math.floor(random() * 150) : 1050 + Math.floor(random() * 240)
    const openedAt = zoned(y, m - 1, d, openMinutes)
    if (openedAt.getTime() > now - 2 * 3_600_000) continue // only finished tabs
    const table = pick(tables)
    const sessionId = randomUUID()
    const rounds = 1 + Math.floor(random() * 3)
    let tabTotal = 0
    let last = openedAt
    for (let r = 1; r <= rounds; r++) {
      const placed = new Date(openedAt.getTime() + (r - 1) * (15 + Math.floor(random() * 25)) * 60_000)
      last = placed
      const orderId = randomUUID()
      const lines = Array.from({ length: 1 + Math.floor(random() * 4) }, (_, i) => {
        const item = pick(simpleItems)
        const quantity = 1 + Math.floor(random() * 2)
        const taxes = applicableTaxes(taxDefs, links, item)
        return { item, quantity, taxes, position: i + 1 }
      })
      const summary = summarizeLines(lines.map((l) => ({ line_total_minor: l.item.price_minor * l.quantity, quantity: l.quantity, taxes: l.taxes })))
      tabTotal += summary.total_minor
      const min = (n) => new Date(placed.getTime() + n * 60_000).toISOString()
      orders.push({
        id: orderId, restaurant_id: restaurantId, session_id: sessionId, table_id: table.id, order_number: orderNumber++, session_seq: r,
        status: 'delivered', currency: 'USD', subtotal_minor: summary.subtotal_minor, inclusive_tax_minor: summary.inclusive_tax_minor,
        exclusive_tax_minor: summary.exclusive_tax_minor, total_minor: summary.total_minor, item_count: summary.item_count,
        placed_at: placed.toISOString(), accepted_at: min(1), preparing_at: min(3), ready_at: min(14), delivered_at: min(17), created_at: placed.toISOString(),
      })
      for (const l of lines) {
        orderItems.push({
          order_id: orderId, restaurant_id: restaurantId, session_id: sessionId, position: l.position, menu_item_id: l.item.id, name: l.item.name,
          applied_taxes: l.taxes, unit_price_minor: l.item.price_minor, quantity: l.quantity, line_total_minor: l.item.price_minor * l.quantity, created_at: placed.toISOString(),
        })
      }
      for (const t of summary.taxes) {
        orderTaxes.push({ order_id: orderId, restaurant_id: restaurantId, tax_id: t.tax_id, name: t.name, rate_bps: t.rate_bps, is_inclusive: t.is_inclusive, amount_minor: t.amount_minor })
      }
    }
    const paidAt = new Date(last.getTime() + 45 * 60_000)
    sessions.push({
      id: sessionId, restaurant_id: restaurantId, table_id: table.id, status: 'closed', party_size: 1 + Math.floor(random() * 5), guest_count: 0,
      order_count: rounds, opened_at: openedAt.toISOString(), paid_at: paidAt.toISOString(), closed_at: new Date(paidAt.getTime() + 10 * 60_000).toISOString(),
      created_at: openedAt.toISOString(),
    })
    payments.push({
      restaurant_id: restaurantId, session_id: sessionId, method: pick(['card', 'cash', 'card', 'other']), status: 'succeeded',
      amount_minor: tabTotal, currency: 'USD', confirmed_at: paidAt.toISOString(), created_at: paidAt.toISOString(),
    })
    if (random() < 0.3) {
      const rating = random() < 0.62 ? 5 : random() < 0.75 ? 4 : 3
      reviews.push({ restaurant_id: restaurantId, session_id: sessionId, rating, body: pick(bodies), guest_name: pick(['Maya', 'Jordan', 'Priya', 'Tom', 'Aisha', 'Diego', null]), created_at: new Date(paidAt.getTime() + 3_600_000).toISOString() })
    }
  }
}

async function insertAll(table, rows) {
  for (let i = 0; i < rows.length; i += 500) must(await db.from(table).insert(rows.slice(i, i + 500), { defaultToNull: false }), table)
}
await insertAll('table_sessions', sessions)
await insertAll('orders', orders)
await insertAll('order_items', orderItems)
await insertAll('order_taxes', orderTaxes)
await insertAll('payments', payments)
await insertAll('reviews', reviews)

// Feature the three newest five-star written reviews.
const featured = reviews.filter((r) => r.rating === 5 && r.body).slice(-3).map((r) => r.session_id)
if (featured.length) must(await db.from('reviews').update({ is_featured: true }).in('session_id', featured), 'feature reviews')
must(await db.from('restaurants').update({ next_order_number: orderNumber }).eq('id', restaurantId), 'order counter')

console.info(`Done: The Globe at /r/${args.slug} — ${tables.length} tables, ${Object.keys(items).length} menu items, ${sessions.length} past tabs, ${orders.length} orders, ${reviews.length} reviews.`)
console.info(`Sign in as ${email} and open /admin. Print table QR codes from Admin → Tables & QR codes.`)
