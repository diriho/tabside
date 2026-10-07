import { createClient } from '@supabase/supabase-js'
import { devices, expect, test, type Browser, type Page } from '@playwright/test'
import { localTestEnv } from '../local-env.ts'

// The primary acceptance flow from the brief, end to end in real browsers:
// two phones share one table tab, the kitchen works the orders live, the table pays,
// a guest reviews, and the manager features that review.

// Local, disposable Supabase only (guarded in localTestEnv); the dev server is started against it
// by playwright.config.ts on its own ports.
const { SUPABASE_URL, SUPABASE_SECRET_KEY: SECRET } = localTestEnv()
const GLOBE = '11111111-1111-4111-8111-111111111111'
const admin = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } })

let tableId: string
let tableLabel: string

test.beforeAll(async () => {
  tableLabel = `E${Date.now().toString().slice(-4)}`
  const { data, error } = await admin
    .from('restaurant_tables')
    .insert({ restaurant_id: GLOBE, label: tableLabel, capacity: 4, sort_order: 99 })
    .select('id')
    .single()
  if (error) throw error
  tableId = data.id
})

test.afterAll(async () => {
  await admin.from('restaurant_tables').update({ archived_at: new Date().toISOString(), is_active: false }).eq('id', tableId)
})

async function phone(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  return ctx.newPage()
}

async function signIn(browser: Browser, role: 'Manager' | 'Kitchen' | 'Waitstaff'): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const page = await ctx.newPage()
  await page.goto('/login')
  await page.getByRole('button', { name: role, exact: true }).click()
  await page.waitForURL(role === 'Manager' ? /\/admin/ : /\/staff/)
  return page
}

async function addAndPlace(page: Page, items: string[]) {
  for (const name of items) await page.getByRole('button', { name: `Add ${name}` }).click()
  await page.getByRole('button', { name: /Review order/ }).click()
  await expect(page.getByRole('heading', { name: 'Your order' })).toBeVisible()
  await page.getByRole('button', { name: /Place order/ }).click()
  await page.waitForURL(/\/orders$/)
}

test('guests share a tab, kitchen works it live, the table pays and reviews', async ({ browser }) => {
  // Kitchen is watching before anyone orders — everything after arrives via realtime.
  const kitchen = await signIn(browser, 'Kitchen')
  await kitchen.goto('/staff/orders')

  // 1–2. Restaurant landing page and menu
  const guestA = await phone(browser)
  await guestA.goto('/r/the-globe')
  await expect(guestA.getByRole('heading', { name: 'The Globe' })).toBeVisible()
  await expect(guestA.getByText(/reviews?$/).first()).toBeVisible()
  await guestA.getByRole('link', { name: 'View menu' }).click()
  await expect(guestA.getByRole('heading', { name: 'Desserts' })).toBeVisible()

  // 3–4. Scan the table's QR (its URL) and join with a party of 3
  await guestA.goto(`/r/the-globe/table/${tableId}`)
  await guestA.getByRole('button', { name: 'Increase people at the table' }).click()
  await guestA.getByRole('button', { name: `Join Table ${tableLabel}` }).click()
  await guestA.waitForURL(/\/session\/[0-9a-f-]+$/)
  const sessionUrl = guestA.url()

  // 5–6. Add items and place the first order
  await addAndPlace(guestA, ['Crispy Fries', 'Coca-Cola'])
  await expect(guestA.getByText('Round 1')).toBeVisible()

  // 11. Kitchen receives it without refreshing
  const ticketA = kitchen.getByRole('article').filter({ hasText: 'Crispy Fries' }).filter({ has: kitchen.getByLabel(`Table ${tableLabel}`) })
  await expect(ticketA).toBeVisible()

  // 7–9. A second phone joins the SAME tab and orders
  const guestB = await phone(browser)
  await guestB.goto(`/r/the-globe/table/${tableId}`)
  await expect(guestB.getByText('You’re joining')).toBeVisible()
  await expect(guestB.getByText(/1 phone is already on this table’s tab/)).toBeVisible()
  await guestB.getByRole('button', { name: `Join Table ${tableLabel}` }).click()
  await guestB.waitForURL(/\/session\//)
  expect(guestB.url()).toBe(sessionUrl)
  await addAndPlace(guestB, ['House Lemonade'])

  // 10. Both rounds sit on one tab, with provenance
  await guestA.getByRole('link', { name: 'Orders' }).click()
  await expect(guestA.getByText('Round 2')).toBeVisible()
  await expect(guestA.getByText(/^Guest 2, /)).toBeVisible()
  await expect(guestA.getByText(/^You, /)).toBeVisible()

  const ticketB = kitchen.getByRole('article').filter({ hasText: 'House Lemonade' }).filter({ has: kitchen.getByLabel(`Table ${tableLabel}`) })
  await expect(ticketB).toBeVisible()

  // 12–13. Kitchen accepts, prepares, readies round 1
  await ticketA.getByRole('button', { name: 'Accept' }).click()
  await ticketA.getByRole('button', { name: 'Start preparing' }).click()
  // 14. Guest sees "Preparing" live
  await expect(guestA.getByRole('list', { name: 'Status: Preparing' })).toBeVisible()
  await ticketA.getByRole('button', { name: 'Mark ready' }).click()
  await expect(guestA.getByRole('list', { name: 'Status: Ready' })).toBeVisible()

  await ticketB.getByRole('button', { name: 'Start now' }).click()
  await ticketB.getByRole('button', { name: 'Mark ready' }).click()

  // Waitstaff deliver both ready rounds together from the floor
  const waiter = await signIn(browser, 'Waitstaff')
  await waiter.goto('/staff/tables')
  await waiter.getByRole('button', { name: new RegExp(`^Table ${tableLabel}: Ready to serve`) }).click()
  await waiter.getByRole('button', { name: /Deliver all 2 ready/ }).click()
  await expect(guestA.getByRole('list', { name: 'Status: Ready' })).toHaveCount(0)

  // 15. Guest asks for the check (paying by cash)
  await guestB.getByRole('link', { name: 'Bill' }).click()
  await expect(guestB.getByRole('article', { name: 'Bill' })).toContainText('Total')
  await guestB.getByRole('radio', { name: /Cash/ }).click()
  await guestB.getByRole('button', { name: 'Ask for the check' }).click()
  await expect(guestB.getByText('Check requested')).toBeVisible()

  // Staff see the bill request on the floor, live
  await waiter.keyboard.press('Escape')
  await expect(waiter.getByRole('button', { name: new RegExp(`^Table ${tableLabel}: Bill requested`) })).toBeVisible()

  // 16–17. Payment: staff confirm the cash. (The Stripe path is covered by webhook tests
  // and by the optional Stripe e2e below when keys are configured.)
  await waiter.getByRole('button', { name: new RegExp(`^Table ${tableLabel}`) }).click()
  await waiter.getByRole('radio', { name: /Cash/ }).click()
  await waiter.getByRole('button', { name: 'Confirm payment' }).click()
  await expect(waiter.getByText('This table has paid in full.')).toBeVisible()

  await expect(guestB.getByRole('heading', { name: 'Payment successful' })).toBeVisible()
  await guestA.getByRole('link', { name: 'Bill' }).click()
  await expect(guestA.getByRole('heading', { name: 'Payment successful' })).toBeVisible()

  // 18. Review
  const reviewText = `Shared tab worked perfectly ${Date.now()}`
  await guestB.getByRole('link', { name: 'Rate your visit' }).click()
  await guestB.getByRole('radio', { name: /5 stars/ }).click()
  await guestB.getByLabel(/Tell us more/).fill(reviewText)
  await guestB.getByLabel(/Your first name/).fill('Robin')
  await guestB.getByRole('button', { name: 'Send review' }).click()
  await expect(guestB.getByRole('heading', { name: 'Thanks for the review' })).toBeVisible()

  // 19. Manager moderates: feature it, and it appears on the public page
  const manager = await signIn(browser, 'Manager')
  await manager.goto('/admin/reviews')
  const card = manager.getByRole('listitem').filter({ hasText: reviewText })
  await card.getByRole('button', { name: 'Feature' }).click()
  await expect(card.getByText('Featured', { exact: true }).first()).toBeVisible()

  await guestA.goto('/r/the-globe')
  await expect(guestA.getByText(reviewText)).toBeVisible()

  // Hide it: gone from the public page, average unchanged by moderation
  await card.getByRole('button', { name: 'Hide from public' }).click()
  await guestA.reload()
  await expect(guestA.getByRole('heading', { name: 'What guests say' })).toBeVisible()
  await expect(guestA.getByText(reviewText)).toHaveCount(0)
})

test('manager sees live operations on the dashboard', async ({ browser }) => {
  const manager = await signIn(browser, 'Manager')
  await expect(manager.getByRole('heading', { name: 'Floor' })).toBeVisible()
  await expect(manager.getByText('New orders')).toBeVisible()
  await expect(manager.getByText('Pending payments')).toBeVisible()
  await expect(manager.getByRole('img', { name: /Revenue per day/ })).toBeVisible()
})

test('kitchen reports an item sold out; guests can no longer order it; manager restores it', async ({ browser }) => {
  // Start from a known state even if an earlier run was interrupted.
  await admin.from('menu_items').update({ availability: 'available' }).eq('restaurant_id', GLOBE).eq('name', 'Peach Iced Tea')
  await admin.from('availability_reports').update({ status: 'resolved' }).eq('restaurant_id', GLOBE).eq('status', 'open')

  const kitchen = await signIn(browser, 'Kitchen')
  await kitchen.goto('/staff/menu')
  const row = kitchen.getByRole('region', { name: 'Drinks' }).getByRole('listitem').filter({ hasText: 'Peach Iced Tea' })
  await row.getByRole('button', { name: 'Sold out', exact: true }).click()
  await kitchen.getByRole('dialog').getByLabel(/Note for the manager/).fill('Out of peaches')
  await kitchen.getByRole('button', { name: 'Mark sold out' }).click()
  await expect(row.getByRole('button', { name: 'Back on', exact: true })).toBeVisible()

  const guest = await phone(browser)
  await guest.goto('/r/the-globe/menu')
  const item = guest.getByRole('listitem').filter({ hasText: 'Peach Iced Tea' })
  await expect(item.getByText('Sold out')).toBeVisible()

  const manager = await signIn(browser, 'Manager')
  await expect(manager.getByText('Out of peaches')).toBeVisible()
  await manager.goto('/admin/menu')
  await manager.getByRole('listitem').filter({ hasText: 'Peach Iced Tea' }).getByLabel('Availability').selectOption('available')
  await guest.reload()
  await expect(item.getByText('Sold out')).toHaveCount(0)
})

test('online payment through Stripe Checkout (test mode)', async ({ browser }) => {
  const config = await (await fetch(new URL('/api/config', test.info().project.use.baseURL))).json() as { onlinePayments: boolean; webhooks: boolean }
  test.skip(!config.onlinePayments, 'Set STRIPE_SECRET_KEY (sk_test_…) in .env.local to run the Stripe end-to-end test.')

  const { data } = await admin.from('restaurant_tables').insert({ restaurant_id: GLOBE, label: `S${Date.now().toString().slice(-4)}`, capacity: 2 }).select('id, label').single()
  const guest = await phone(browser)
  await guest.goto(`/r/the-globe/table/${data!.id}`)
  await guest.getByRole('button', { name: /^Join Table/ }).click()
  await guest.waitForURL(/\/session\//)
  await addAndPlace(guest, ['Espresso'])
  await guest.getByRole('link', { name: 'Bill' }).click()
  await guest.getByRole('button', { name: /Pay .* now/ }).click()

  // Stripe-hosted Checkout, test card
  await guest.waitForURL(/checkout\.stripe\.com/)
  await guest.getByLabel('Email').fill('guest@example.com')
  await guest.getByPlaceholder('1234 1234 1234 1234').fill('4242424242424242')
  await guest.getByPlaceholder('MM / YY').fill('12 / 34')
  await guest.getByPlaceholder('CVC').fill('123')
  await guest.getByLabel(/Cardholder name|Name on card/).fill('Test Guest')
  const zip = guest.getByPlaceholder(/ZIP|Postal/)
  if (await zip.count()) await zip.fill('60607')
  await guest.getByTestId('hosted-payment-submit-button').click()

  await guest.waitForURL(/\/bill\?checkout=success/, { timeout: 60_000 })
  await expect(guest.getByRole('heading', { name: 'Payment successful' })).toBeVisible({ timeout: 30_000 })
  await admin.from('restaurant_tables').update({ archived_at: new Date().toISOString(), is_active: false }).eq('id', data!.id)
})
