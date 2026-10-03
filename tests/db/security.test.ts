import { beforeAll, describe, expect, it } from 'vitest'
import { createFixture, createUser, expectError, guestClient, joinTable, must, placeOrder, publicClient, type Client, type Fixture } from './helpers.ts'

let a: Fixture
let b: Fixture
let guestA: Client
let sessionA: string
let orderA: string

beforeAll(async () => {
  ;[a, b] = await Promise.all([createFixture(), createFixture()])
  guestA = await guestClient()
  sessionA = (await joinTable(guestA, a.tables[0]!, 2)).session_id
  orderA = (await placeOrder(guestA, sessionA, [{ menu_item_id: a.items.coke, quantity: 1 }])).id
})

describe('guest isolation', () => {
  it('a guest at another table cannot see this table’s session or orders', async () => {
    const other = await guestClient()
    await joinTable(other, a.tables[1]!, 2)
    expect(must(await other.from('table_sessions').select('id').eq('id', sessionA))).toHaveLength(0)
    expect(must(await other.from('orders').select('id').eq('session_id', sessionA))).toHaveLength(0)
    expect(must(await other.from('order_items').select('id').eq('session_id', sessionA))).toHaveLength(0)
    expect(must(await other.from('payments').select('id').eq('session_id', sessionA))).toHaveLength(0)
    await expectError(other.rpc('session_bill', { p_session_id: sessionA }), 'session_not_found')
  })

  it('anonymous visitors see the menu but no operational data', async () => {
    const anon = publicClient()
    expect(must(await anon.from('menu_items').select('id').eq('restaurant_id', a.restaurantId)).length).toBe(5)
    expect(must(await anon.from('orders').select('id'))).toHaveLength(0)
    expect(must(await anon.from('table_sessions').select('id'))).toHaveLength(0)
    expect(must(await anon.from('staff_members').select('id'))).toHaveLength(0)
    await expectError(anon.rpc('join_table', { p_table_id: a.tables[0]! }), 'permission denied')
  })

  it('hidden items are invisible to guests but visible to staff', async () => {
    expect(must(await guestA.from('menu_items').select('id').eq('id', a.items.hidden))).toHaveLength(0)
    expect(must(await a.kitchen.from('menu_items').select('id').eq('id', a.items.hidden))).toHaveLength(1)
  })

  it('guests cannot change prices, write orders directly or touch payments', async () => {
    const res = await guestA.from('menu_items').update({ price_minor: 1 }).eq('id', a.items.coke).select()
    expect(res.data ?? []).toHaveLength(0)
    const coke = must(await guestA.from('menu_items').select('price_minor').eq('id', a.items.coke).single())
    expect(coke.price_minor).toBe(300)

    await expectError(
      guestA.from('orders').update({ total_minor: 0 }).eq('id', orderA),
      'permission denied',
    )
    await expectError(
      guestA.from('orders').insert({
        restaurant_id: a.restaurantId, session_id: sessionA, table_id: a.tables[0]!, order_number: 1, session_seq: 99, currency: 'USD',
      }),
      'permission denied',
    )
    await expectError(
      guestA.from('payments').insert({ restaurant_id: a.restaurantId, session_id: sessionA, method: 'cash', status: 'succeeded', amount_minor: 330, currency: 'USD' }),
      'permission denied',
    )
    await expectError(guestA.rpc('record_manual_payment', { p_session_id: sessionA, p_method: 'cash' }), 'forbidden')
  })

  it('guests cannot call the Stripe settlement functions', async () => {
    await expectError(
      guestA.rpc('stripe_complete_payment', {
        p_payment_id: '00000000-0000-0000-0000-000000000000', p_checkout_session_id: 'x', p_payment_intent_id: 'x', p_amount_minor: 1, p_currency: 'USD',
      }),
      'permission denied',
    )
    await expectError(guestA.rpc('stripe_prepare_payment', { p_session_id: sessionA, p_user_id: '00000000-0000-0000-0000-000000000000' }), 'permission denied')
  })

  it('anonymous guests cannot create restaurants or become staff', async () => {
    await expectError(guestA.rpc('create_restaurant', { p_name: 'Nope', p_slug: 'nope-guest' }), 'account_required')
    await expectError(
      guestA.from('staff_members').insert({ restaurant_id: a.restaurantId, user_id: '00000000-0000-0000-0000-000000000000', role: 'manager', display_name: 'x' }),
      'permission denied',
    )
  })
})

describe('restaurant isolation', () => {
  it('a manager cannot read or change another restaurant’s operations', async () => {
    expect(must(await b.manager.from('orders').select('id').eq('restaurant_id', a.restaurantId))).toHaveLength(0)
    expect(must(await b.manager.from('staff_members').select('id').eq('restaurant_id', a.restaurantId))).toHaveLength(0)
    await expectError(b.manager.rpc('get_table_board', { p_restaurant_id: a.restaurantId }), 'forbidden')
    await expectError(b.manager.rpc('get_dashboard', { p_restaurant_id: a.restaurantId }), 'forbidden')
    await expectError(b.manager.rpc('set_order_status', { p_order_id: orderA, p_status: 'accepted' }), 'forbidden')

    const res = await b.manager.from('menu_items').update({ price_minor: 1 }).eq('id', a.items.coke).select()
    expect(res.data ?? []).toHaveLength(0)
    await expectError(
      b.manager.from('menu_items').insert({ restaurant_id: a.restaurantId, name: 'Injected', price_minor: 1 }),
      'row-level security',
    )
  })

  it('a menu item cannot be filed under another restaurant’s category', async () => {
    const { error } = await a.manager.from('menu_items').insert({
      restaurant_id: a.restaurantId, category_id: b.categories.food, name: 'Cross', price_minor: 100,
    })
    expect(error?.message).toMatch(/foreign key/)
  })
})

describe('staff roles', () => {
  it('kitchen and waitstaff cannot change prices, taxes or staff', async () => {
    for (const staff of [a.kitchen, a.waiter]) {
      const res = await staff.from('menu_items').update({ price_minor: 1 }).eq('id', a.items.burger).select()
      expect(res.data ?? []).toHaveLength(0)
      const tax = await staff.from('taxes').update({ rate_bps: 0 }).eq('restaurant_id', a.restaurantId).select()
      expect(tax.data ?? []).toHaveLength(0)
      const st = await staff.from('staff_members').update({ role: 'manager' }).eq('restaurant_id', a.restaurantId).select()
      expect(st.data ?? []).toHaveLength(0)
    }
    const burger = must(await a.manager.from('menu_items').select('price_minor').eq('id', a.items.burger).single())
    expect(burger.price_minor).toBe(1400)
  })

  it('kitchen can toggle sold out but not hide items', async () => {
    must(await a.kitchen.rpc('set_item_availability', { p_item_id: a.items.beer, p_availability: 'sold_out' }))
    await expectError(a.kitchen.rpc('set_item_availability', { p_item_id: a.items.beer, p_availability: 'hidden' }), 'forbidden')
    must(await a.kitchen.rpc('set_item_availability', { p_item_id: a.items.beer, p_availability: 'available' }))
  })

  it('the last manager and the owner are protected', async () => {
    const own = must(await a.manager.from('staff_members').select('id').eq('restaurant_id', a.restaurantId).eq('role', 'manager').single())
    await expectError(a.manager.from('staff_members').update({ role: 'waiter' }).eq('id', own.id), 'owner_protected')
  })

  it('managers cannot edit protected restaurant columns directly', async () => {
    await expectError(a.manager.from('restaurants').update({ rating_sum: 999 }).eq('id', a.restaurantId), 'permission denied')
    await expectError(a.manager.from('restaurants').update({ deleted_at: new Date().toISOString() }).eq('id', a.restaurantId), 'permission denied')
    must(await a.manager.from('restaurants').update({ tagline: 'Fresh tagline' }).eq('id', a.restaurantId).select())
  })

  it('a random signed-up user sees nothing operational', async () => {
    const outsider = await createUser('outsider')
    expect(must(await outsider.client.from('orders').select('id'))).toHaveLength(0)
    await expectError(outsider.client.rpc('get_table_board', { p_restaurant_id: a.restaurantId }), 'forbidden')
  })
})
