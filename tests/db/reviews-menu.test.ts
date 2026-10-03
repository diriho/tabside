import { describe, expect, it } from 'vitest'
import { admin, createFixture, createUser, expectError, guestClient, joinTable, must, placeOrder, publicClient } from './helpers.ts'

describe('reviews', () => {
  it('opens after the tab is settled, updates the public average and lets managers moderate', async () => {
    const fx = await createFixture()
    const g = await guestClient()
    const j = await joinTable(g, fx.tables[0]!, 2)
    await placeOrder(g, j.session_id, [{ menu_item_id: fx.items.coke, quantity: 1 }])

    await expectError(g.rpc('submit_review', { p_session_id: j.session_id, p_rating: 5 }), 'review_not_available')
    must(await fx.waiter.rpc('record_manual_payment', { p_session_id: j.session_id, p_method: 'cash' }))

    const review = must(await g.rpc('submit_review', { p_session_id: j.session_id, p_rating: 4, p_body: 'Lovely', p_guest_name: 'Ana' })) as { id: string }
    await expectError(g.rpc('submit_review', { p_session_id: j.session_id, p_rating: 7 }), 'invalid_rating')

    const g2 = await guestClient()
    await joinTable(g2, fx.tables[0]!)
    // g2 joined the settled tab? No — a newcomer starts a fresh tab, so they cannot review the old one
    await expectError(g2.rpc('submit_review', { p_session_id: j.session_id, p_rating: 1 }), 'session_not_found')

    const anon = publicClient()
    let r = must(await anon.from('restaurants').select('rating_count, rating_sum').eq('id', fx.restaurantId).single())
    expect(r).toEqual({ rating_count: 1, rating_sum: 4 })
    expect(must(await anon.from('reviews').select('id, body').eq('restaurant_id', fx.restaurantId))).toHaveLength(1)

    // Manager hides it: public loses the text, average still counts it
    must(await fx.manager.rpc('moderate_review', { p_review_id: review.id, p_is_hidden: true, p_is_featured: false }))
    expect(must(await anon.from('reviews').select('id').eq('restaurant_id', fx.restaurantId))).toHaveLength(0)
    r = must(await anon.from('restaurants').select('rating_count, rating_sum').eq('id', fx.restaurantId).single())
    expect(r.rating_count).toBe(1)

    // Managers can never rewrite a rating
    await expectError(fx.manager.from('reviews').update({ rating: 5 }).eq('id', review.id), 'permission denied')

    // featured-only display mode
    must(await fx.manager.rpc('moderate_review', { p_review_id: review.id, p_is_hidden: false, p_is_featured: false }))
    must(await fx.manager.from('restaurant_review_settings').update({ display_mode: 'featured_only' }).eq('restaurant_id', fx.restaurantId).select())
    expect(must(await anon.from('reviews').select('id').eq('restaurant_id', fx.restaurantId))).toHaveLength(0)
    must(await fx.manager.rpc('moderate_review', { p_review_id: review.id, p_is_hidden: false, p_is_featured: true }))
    expect(must(await anon.from('reviews').select('id').eq('restaurant_id', fx.restaurantId))).toHaveLength(1)
  })
})

describe('menu availability', () => {
  it('kitchen reports an item: it becomes unorderable, managers are alerted, and it can be restored', async () => {
    const fx = await createFixture()
    const g = await guestClient()
    const j = await joinTable(g, fx.tables[0]!, 2)

    must(await fx.kitchen.rpc('report_item_unavailable', { p_item_id: fx.items.burger, p_note: 'Out of buns' }).then((r) => ({ ...r, data: true })))
    const item = must(await g.from('menu_items').select('availability').eq('id', fx.items.burger).single())
    expect(item.availability).toBe('sold_out')

    await expectError(
      g.rpc('place_order', { p_session_id: j.session_id, p_items: [{ menu_item_id: fx.items.burger, quantity: 1, modifier_ids: [fx.modifiers.mediumRare] }] }),
      'item_unavailable',
    )

    const managerNotes = must(await fx.manager.from('notifications').select('title, body').eq('type', 'item.unavailable'))
    expect(managerNotes[0]?.title).toBe('Burger is unavailable')
    expect(managerNotes[0]?.body).toContain('Out of buns')
    // waitstaff are not the audience for this one
    expect(must(await fx.waiter.from('notifications').select('id').eq('type', 'item.unavailable'))).toHaveLength(0)

    const reports = must(await fx.manager.from('availability_reports').select('status').eq('menu_item_id', fx.items.burger))
    expect(reports).toEqual([{ status: 'open' }])

    must(await fx.manager.rpc('set_item_availability', { p_item_id: fx.items.burger, p_availability: 'available' }))
    const resolved = must(await fx.manager.from('availability_reports').select('status').eq('menu_item_id', fx.items.burger))
    expect(resolved).toEqual([{ status: 'resolved' }])
    await placeOrder(g, j.session_id, [{ menu_item_id: fx.items.burger, quantity: 1, modifier_ids: [fx.modifiers.mediumRare] }])
  })

  it('price changes never alter orders already placed', async () => {
    const fx = await createFixture()
    const g = await guestClient()
    const j = await joinTable(g, fx.tables[0]!, 2)
    const order = await placeOrder(g, j.session_id, [{ menu_item_id: fx.items.coke, quantity: 1 }])
    must(await fx.manager.from('menu_items').update({ price_minor: 999 }).eq('id', fx.items.coke).select())
    const after = must(await g.from('orders').select('subtotal_minor').eq('id', order.id).single())
    expect(after.subtotal_minor).toBe(300)
  })

  it('blocks a currency change while tabs with orders are open', async () => {
    const fx = await createFixture()
    const g = await guestClient()
    const j = await joinTable(g, fx.tables[0]!, 2)
    await placeOrder(g, j.session_id, [{ menu_item_id: fx.items.coke, quantity: 1 }])
    await expectError(fx.manager.from('restaurants').update({ currency: 'EUR' }).eq('id', fx.restaurantId), 'currency_locked_active_tabs')
  })
})

describe('restaurant lifecycle', () => {
  it('any real account can create a restaurant and becomes its owner-manager', async () => {
    const u = await createUser('founder')
    const slug = `founder-${Date.now()}`
    const r = must(await u.client.rpc('create_restaurant', { p_name: 'Founders', p_slug: slug, p_currency: 'KES', p_timezone: 'Africa/Nairobi' })) as { id: string; currency: string }
    expect(r.currency).toBe('KES')
    const me = must(await u.client.from('staff_members').select('role, is_owner').eq('restaurant_id', r.id).single())
    expect(me).toEqual({ role: 'manager', is_owner: true })
    await expectError(u.client.rpc('create_restaurant', { p_name: 'Dup', p_slug: slug }), 'slug_taken')
  })

  it('soft-deletes: hidden publicly, records preserved, typed confirmation required', async () => {
    const fx = await createFixture()
    const g = await guestClient()
    const j = await joinTable(g, fx.tables[0]!, 2)
    await placeOrder(g, j.session_id, [{ menu_item_id: fx.items.coke, quantity: 1 }])

    await expectError(fx.kitchen.rpc('delete_restaurant', { p_restaurant_id: fx.restaurantId, p_confirm_slug: fx.slug }), 'forbidden')
    await expectError(fx.manager.rpc('delete_restaurant', { p_restaurant_id: fx.restaurantId, p_confirm_slug: 'wrong' }), 'confirmation_mismatch')
    must(await fx.manager.rpc('delete_restaurant', { p_restaurant_id: fx.restaurantId, p_confirm_slug: fx.slug }).then((r) => ({ ...r, data: true })))

    const anon = publicClient()
    expect(must(await anon.from('restaurants').select('id').eq('id', fx.restaurantId))).toHaveLength(0)
    expect(must(await anon.from('menu_items').select('id').eq('restaurant_id', fx.restaurantId))).toHaveLength(0)
    expect(must(await admin.from('orders').select('id').eq('restaurant_id', fx.restaurantId))).toHaveLength(1)

    const fresh = await guestClient()
    await expectError(fresh.rpc('join_table', { p_table_id: fx.tables[1]! }), 'restaurant_closed')
    await expectError(
      g.rpc('place_order', { p_session_id: j.session_id, p_items: [{ menu_item_id: fx.items.coke, quantity: 1 }] }),
      'restaurant_closed',
    )
  })
})
