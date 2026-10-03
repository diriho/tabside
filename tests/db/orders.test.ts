import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createFixture, expectError, guestClient, joinTable, must, placeOrder, type Client, type Fixture } from './helpers.ts'

let fx: Fixture
let guest: Client
let sessionId: string

beforeAll(async () => {
  fx = await createFixture()
  guest = await guestClient()
  sessionId = (await joinTable(guest, fx.tables[0]!, 2)).session_id
})

describe('placing orders', () => {
  it('prices from the database and computes item-scoped taxes', async () => {
    const order = await placeOrder(guest, sessionId, [
      { menu_item_id: fx.items.burger, quantity: 2, modifier_ids: [fx.modifiers.mediumRare, fx.modifiers.bacon] },
      { menu_item_id: fx.items.beer, quantity: 1 },
    ])
    // burger (1400 + 250 bacon) × 2 = 3300; beer 800
    expect(order.subtotal_minor).toBe(4100)
    // sales tax 10% of 4100 = 410; liquor 5% of 800 = 40
    expect(order.exclusive_tax_minor).toBe(450)
    expect(order.total_minor).toBe(4550)
    expect(order.item_count).toBe(3)
    expect(order.status).toBe('pending')

    const lines = must(await guest.from('order_items').select('name, unit_price_minor, line_total_minor, modifiers').eq('order_id', order.id).order('position'))
    expect(lines[0]).toMatchObject({ name: 'Burger', unit_price_minor: 1650, line_total_minor: 3300 })
    expect((lines[0]!.modifiers as Array<{ name: string }>).map((m) => m.name)).toEqual(['Medium rare', 'Bacon'])

    const taxes = must(await guest.from('order_taxes').select('name, amount_minor').eq('order_id', order.id).order('name'))
    expect(taxes).toEqual([
      { name: 'Liquor tax', amount_minor: 40 },
      { name: 'Sales tax', amount_minor: 410 },
    ])
  })

  it('ignores any price the client tries to send', async () => {
    const order = await placeOrder(guest, sessionId, [
      { menu_item_id: fx.items.coke, quantity: 1, ...({ unit_price_minor: 1, price_minor: 1 } as object) },
    ])
    expect(order.subtotal_minor).toBe(300)
  })

  it('quote_order matches what place_order charges', async () => {
    const items = [
      { menu_item_id: fx.items.pizza, quantity: 1, variant_id: fx.pizzaVariants.large },
      { menu_item_id: fx.items.fries, quantity: 3 },
    ]
    const quote = must(await guest.rpc('quote_order', { p_session_id: sessionId, p_items: items })) as { total_minor: number; subtotal_minor: number }
    const order = await placeOrder(guest, sessionId, items)
    expect(order.total_minor).toBe(quote.total_minor)
    expect(order.subtotal_minor).toBe(1800 + 3 * 550)
  })

  it('validates variants and modifiers', async () => {
    await expectError(guest.rpc('place_order', { p_session_id: sessionId, p_items: [{ menu_item_id: fx.items.pizza, quantity: 1 }] }), 'variant_required')
    await expectError(guest.rpc('place_order', { p_session_id: sessionId, p_items: [{ menu_item_id: fx.items.burger, quantity: 1 }] }), 'modifier_selection_invalid')
    await expectError(
      guest.rpc('place_order', {
        p_session_id: sessionId,
        p_items: [{ menu_item_id: fx.items.burger, quantity: 1, modifier_ids: [fx.modifiers.mediumRare, fx.modifiers.wellDone] }],
      }),
      'modifier_selection_invalid',
    )
    await expectError(
      guest.rpc('place_order', {
        p_session_id: sessionId,
        p_items: [{ menu_item_id: fx.items.coke, quantity: 1, modifier_ids: [fx.modifiers.bacon] }],
      }),
      'invalid_modifier',
    )
    await expectError(guest.rpc('place_order', { p_session_id: sessionId, p_items: [{ menu_item_id: fx.items.coke, quantity: 0 }] }), 'invalid_quantity')
    await expectError(guest.rpc('place_order', { p_session_id: sessionId, p_items: [] }), 'empty_order')
    await expectError(guest.rpc('place_order', { p_session_id: sessionId, p_items: [{ menu_item_id: fx.items.hidden, quantity: 1 }] }), 'item_unavailable')
  })

  it('rejects items from another restaurant', async () => {
    const other = await createFixture()
    await expectError(
      guest.rpc('place_order', { p_session_id: sessionId, p_items: [{ menu_item_id: other.items.coke, quantity: 1 }] }),
      'item_not_found',
    )
  })

  it('only lets guests of the session order', async () => {
    const stranger = await guestClient()
    await expectError(
      stranger.rpc('place_order', { p_session_id: sessionId, p_items: [{ menu_item_id: fx.items.coke, quantity: 1 }] }),
      'not_session_guest',
    )
  })
})

describe('order lifecycle', () => {
  it('moves forward through the kitchen and notifies the guest', async () => {
    const order = await placeOrder(guest, sessionId, [{ menu_item_id: fx.items.fries, quantity: 1 }])
    for (const status of ['accepted', 'preparing', 'ready'] as const) {
      must(await fx.kitchen.rpc('set_order_status', { p_order_id: order.id, p_status: status }))
    }
    must(await fx.waiter.rpc('set_order_status', { p_order_id: order.id, p_status: 'delivered' }))

    const row = must(await guest.from('orders').select('status, accepted_at, preparing_at, ready_at, delivered_at').eq('id', order.id).single())
    expect(row.status).toBe('delivered')
    expect(row.accepted_at && row.preparing_at && row.ready_at && row.delivered_at).toBeTruthy()

    const history = must(await guest.from('order_status_history').select('from_status, to_status').eq('order_id', order.id).order('created_at'))
    expect(history.map((h) => h.to_status)).toEqual(['pending', 'accepted', 'preparing', 'ready', 'delivered'])

    const notes = must(await guest.from('notifications').select('type').eq('session_id', sessionId).eq('audience', 'session'))
    expect(notes.map((n) => n.type)).toEqual(expect.arrayContaining(['order.preparing', 'order.ready', 'order.delivered']))
  })

  it('rejects backwards and post-delivery transitions', async () => {
    const order = await placeOrder(guest, sessionId, [{ menu_item_id: fx.items.coke, quantity: 1 }])
    must(await fx.kitchen.rpc('set_order_status', { p_order_id: order.id, p_status: 'preparing' }))
    await expectError(fx.kitchen.rpc('set_order_status', { p_order_id: order.id, p_status: 'pending' }), 'invalid_transition')
    must(await fx.kitchen.rpc('set_order_status', { p_order_id: order.id, p_status: 'delivered' }))
    await expectError(fx.waiter.rpc('set_order_status', { p_order_id: order.id, p_status: 'cancelled' }), 'invalid_transition')
  })

  it('lets only managers and waitstaff cancel, and guests not change status at all', async () => {
    const order = await placeOrder(guest, sessionId, [{ menu_item_id: fx.items.coke, quantity: 1 }])
    await expectError(guest.rpc('set_order_status', { p_order_id: order.id, p_status: 'accepted' }), 'forbidden')
    await expectError(fx.kitchen.rpc('set_order_status', { p_order_id: order.id, p_status: 'cancelled' }), 'forbidden')
    must(await fx.waiter.rpc('set_order_status', { p_order_id: order.id, p_status: 'cancelled', p_reason: 'Guest changed mind' }))
  })

  it('delivers all ready orders of a table together', async () => {
    const o1 = await placeOrder(guest, sessionId, [{ menu_item_id: fx.items.fries, quantity: 1 }])
    const o2 = await placeOrder(guest, sessionId, [{ menu_item_id: fx.items.coke, quantity: 1 }])
    for (const o of [o1, o2]) must(await fx.kitchen.rpc('set_order_status', { p_order_id: o.id, p_status: 'ready' }))
    const moved = must(await fx.waiter.rpc('advance_session_orders', { p_session_id: sessionId, p_from: 'ready', p_to: 'delivered' }))
    expect(moved).toBe(2)
  })

  it('voids an unavailable line, re-totals the order and tells the guest', async () => {
    const order = await placeOrder(guest, sessionId, [
      { menu_item_id: fx.items.fries, quantity: 2 },
      { menu_item_id: fx.items.coke, quantity: 1 },
    ])
    const lines = must(await fx.kitchen.from('order_items').select('id, name').eq('order_id', order.id))
    const fries = lines.find((l) => l.name === 'Fries')!
    must(await fx.kitchen.rpc('void_order_item', { p_order_item_id: fries.id, p_reason: 'Fryer down', p_mark_sold_out: true }))

    const updated = must(await guest.from('orders').select('subtotal_minor, total_minor, status').eq('id', order.id).single())
    expect(updated.subtotal_minor).toBe(300)
    expect(updated.total_minor).toBe(330)
    expect(updated.status).toBe('pending')

    const item = must(await admin.from('menu_items').select('availability').eq('id', fx.items.fries).single())
    expect(item.availability).toBe('sold_out')

    const guestNote = must(await guest.from('notifications').select('title').eq('session_id', sessionId).eq('type', 'item.voided'))
    expect(guestNote[0]?.title).toBe('Fries is currently unavailable')

    // restore for other tests
    must(await fx.manager.rpc('set_item_availability', { p_item_id: fx.items.fries, p_availability: 'available' }))
  })
})
