import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.ts'

// Defaults are the public demo keys of the local `supabase start` stack.
const URL = process.env.SUPABASE_URL as string
const PUBLISHABLE = process.env.VITE_SUPABASE_ANON_KEY as string
const SECRET = process.env.SUPABASE_SECRET_KEY as string

export type Client = SupabaseClient<Database>

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }

export const admin: Client = createClient<Database>(URL, SECRET, clientOptions)

export function publicClient(): Client {
  return createClient<Database>(URL, PUBLISHABLE, clientOptions)
}

export async function guestClient(): Promise<Client> {
  const client = publicClient()
  const { error } = await client.auth.signInAnonymously()
  if (error) throw error
  return client
}

export async function userClient(email: string, password: string): Promise<Client> {
  const client = publicClient()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

export async function createUser(label: string): Promise<{ id: string; email: string; client: Client }> {
  const email = `${label}-${randomUUID().slice(0, 8)}@tests.tabside`
  const password = 'test-password-123'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: label },
  })
  if (error || !data.user) throw error ?? new Error('createUser failed')
  return { id: data.user.id, email, client: await userClient(email, password) }
}

/** Unwraps a Supabase response, throwing on error. */
export function must<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message)
  if (result.data === null || result.data === undefined) throw new Error('No data')
  return result.data as NonNullable<T>
}

export interface Fixture {
  restaurantId: string
  slug: string
  currency: string
  tables: string[]
  categories: { food: string; drinks: string }
  items: {
    burger: string
    fries: string
    coke: string
    beer: string
    pizza: string
    hidden: string
  }
  pizzaVariants: { small: string; large: string }
  modifiers: { cookGroup: string; mediumRare: string; wellDone: string; bacon: string; cheese: string }
  manager: Client
  managerId: string
  kitchen: Client
  waiter: Client
}

/**
 * Builds an isolated restaurant: 3 tables, a small menu with variants/modifiers,
 * a 10% exclusive sales tax on everything and a 5% liquor tax on beer only.
 */
export async function createFixture(opts: { currency?: string; inclusiveVat?: boolean } = {}): Promise<Fixture> {
  const currency = opts.currency ?? 'USD'
  const managerUser = await createUser('manager')
  const kitchenUser = await createUser('kitchen')
  const waiterUser = await createUser('waiter')
  const slug = `test-${randomUUID().slice(0, 8)}`

  const restaurant = must(
    await managerUser.client.rpc('create_restaurant', {
      p_name: 'Test Bistro',
      p_slug: slug,
      p_currency: currency,
      p_timezone: 'America/Chicago',
    }),
  ) as { id: string }
  const restaurantId = restaurant.id

  must(
    await admin.from('staff_members').insert([
      { restaurant_id: restaurantId, user_id: kitchenUser.id, role: 'kitchen', display_name: 'Kim Kitchen' },
      { restaurant_id: restaurantId, user_id: waiterUser.id, role: 'waiter', display_name: 'Wes Waiter' },
    ]).select(),
  )

  const m = managerUser.client
  const tables = must(
    await m.from('restaurant_tables').insert([
      { restaurant_id: restaurantId, label: '1', capacity: 2 },
      { restaurant_id: restaurantId, label: '2', capacity: 4 },
      { restaurant_id: restaurantId, label: '3', capacity: 6 },
    ]).select('id, label').order('label'),
  )

  const [food, drinks] = must(
    await m.from('menu_categories').insert([
      { restaurant_id: restaurantId, name: 'Food', sort_order: 1 },
      { restaurant_id: restaurantId, name: 'Drinks', sort_order: 2 },
    ]).select('id, name, sort_order').order('sort_order'),
  )

  const items = must(
    await m.from('menu_items').insert([
      { restaurant_id: restaurantId, category_id: food!.id, name: 'Burger', price_minor: 1400 },
      { restaurant_id: restaurantId, category_id: food!.id, name: 'Fries', price_minor: 550 },
      { restaurant_id: restaurantId, category_id: drinks!.id, name: 'Coke', price_minor: 300 },
      { restaurant_id: restaurantId, category_id: drinks!.id, name: 'Beer', price_minor: 800 },
      { restaurant_id: restaurantId, category_id: food!.id, name: 'Pizza', price_minor: 0 },
      { restaurant_id: restaurantId, category_id: food!.id, name: 'Secret Special', price_minor: 2000, availability: 'hidden' },
    ], { defaultToNull: false }).select('id, name'),
  )
  const byName = (name: string) => items.find((i) => i.name === name)!.id

  const variants = must(
    await m.from('menu_item_variants').insert([
      { restaurant_id: restaurantId, item_id: byName('Pizza'), name: '10"', price_minor: 1400, sort_order: 1 },
      { restaurant_id: restaurantId, item_id: byName('Pizza'), name: '14"', price_minor: 1800, sort_order: 2 },
    ]).select('id, name'),
  )

  const groups = must(
    await m.from('menu_modifier_groups').insert([
      { restaurant_id: restaurantId, item_id: byName('Burger'), name: 'Cook', min_select: 1, max_select: 1, sort_order: 1 },
      { restaurant_id: restaurantId, item_id: byName('Burger'), name: 'Add-ons', min_select: 0, max_select: 2, sort_order: 2 },
    ]).select('id, name'),
  )
  const cook = groups.find((g) => g.name === 'Cook')!.id
  const addons = groups.find((g) => g.name === 'Add-ons')!.id
  const mods = must(
    await m.from('menu_modifiers').insert([
      { restaurant_id: restaurantId, group_id: cook, name: 'Medium rare', price_delta_minor: 0, sort_order: 1 },
      { restaurant_id: restaurantId, group_id: cook, name: 'Well done', price_delta_minor: 0, sort_order: 2 },
      { restaurant_id: restaurantId, group_id: addons, name: 'Bacon', price_delta_minor: 250, sort_order: 1 },
      { restaurant_id: restaurantId, group_id: addons, name: 'Cheese', price_delta_minor: 150, sort_order: 2 },
    ]).select('id, name'),
  )
  const mod = (name: string) => mods.find((x) => x.name === name)!.id

  if (opts.inclusiveVat) {
    must(await m.from('taxes').insert({ restaurant_id: restaurantId, name: 'VAT', rate_bps: 1800, is_inclusive: true, scope: 'all' }).select())
  } else {
    must(await m.from('taxes').insert({ restaurant_id: restaurantId, name: 'Sales tax', rate_bps: 1000, scope: 'all', sort_order: 1 }).select())
    const liquor = must(
      await m.from('taxes').insert({ restaurant_id: restaurantId, name: 'Liquor tax', rate_bps: 500, scope: 'items', sort_order: 2 }).select('id').single(),
    )
    must(await m.from('tax_items').insert({ tax_id: liquor.id, item_id: byName('Beer'), restaurant_id: restaurantId }).select())
  }

  return {
    restaurantId,
    slug,
    currency,
    tables: tables.map((t) => t.id),
    categories: { food: food!.id, drinks: drinks!.id },
    items: {
      burger: byName('Burger'),
      fries: byName('Fries'),
      coke: byName('Coke'),
      beer: byName('Beer'),
      pizza: byName('Pizza'),
      hidden: byName('Secret Special'),
    },
    pizzaVariants: { small: variants.find((v) => v.name === '10"')!.id, large: variants.find((v) => v.name === '14"')!.id },
    modifiers: { cookGroup: cook, mediumRare: mod('Medium rare'), wellDone: mod('Well done'), bacon: mod('Bacon'), cheese: mod('Cheese') },
    manager: m,
    managerId: managerUser.id,
    kitchen: kitchenUser.client,
    waiter: waiterUser.client,
  }
}

export interface JoinResult {
  session_id: string
  guest_id: string
  guest_number: number
  is_new_session: boolean
  party_size: number
  guest_count: number
  table_label: string
}

export async function joinTable(client: Client, tableId: string, partySize?: number): Promise<JoinResult> {
  return must(await client.rpc('join_table', { p_table_id: tableId, p_party_size: partySize })) as unknown as JoinResult
}

export interface OrderRow {
  id: string
  order_number: number
  session_seq: number
  status: string
  subtotal_minor: number
  exclusive_tax_minor: number
  inclusive_tax_minor: number
  total_minor: number
  item_count: number
  guest_id: string
}

export async function placeOrder(
  client: Client,
  sessionId: string,
  items: Array<{ menu_item_id: string; quantity: number; variant_id?: string; modifier_ids?: string[]; notes?: string }>,
): Promise<OrderRow> {
  return must(await client.rpc('place_order', { p_session_id: sessionId, p_items: items })) as unknown as OrderRow
}

/** Expects a Supabase call to fail with a message containing `fragment`. */
export async function expectError(promise: PromiseLike<{ error: { message: string } | null }>, fragment: string) {
  const { error } = await promise
  if (!error) throw new Error(`Expected error "${fragment}" but call succeeded`)
  if (!error.message.includes(fragment)) {
    throw new Error(`Expected error containing "${fragment}" but got "${error.message}"`)
  }
}
