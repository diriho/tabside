import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createFixture, expectError, guestClient, joinTable, must, placeOrder, type Fixture } from './helpers.ts'

let fx: Fixture

beforeAll(async () => {
  fx = await createFixture()
})

describe('shared table sessions', () => {
  it('opens one session for the first guest and adds later guests to it', async () => {
    const a = await guestClient()
    const b = await guestClient()
    const c = await guestClient()

    const ja = await joinTable(a, fx.tables[0]!, 4)
    expect(ja.is_new_session).toBe(true)
    expect(ja.guest_number).toBe(1)
    expect(ja.party_size).toBe(4)

    const jb = await joinTable(b, fx.tables[0]!)
    const jc = await joinTable(c, fx.tables[0]!)
    expect(jb.session_id).toBe(ja.session_id)
    expect(jc.session_id).toBe(ja.session_id)
    expect(jb.is_new_session).toBe(false)
    expect([jb.guest_number, jc.guest_number]).toEqual([2, 3])
    expect(jc.guest_count).toBe(3)
    expect(jc.party_size).toBe(4)
  })

  it('is idempotent for the same phone', async () => {
    const g = await guestClient()
    const first = await joinTable(g, fx.tables[1]!, 2)
    const again = await joinTable(g, fx.tables[1]!)
    expect(again.session_id).toBe(first.session_id)
    expect(again.guest_id).toBe(first.guest_id)
    expect(again.guest_count).toBe(first.guest_count)
  })

  it('never creates two active sessions when many phones scan at once', async () => {
    const guests = await Promise.all(Array.from({ length: 6 }, () => guestClient()))
    const results = await Promise.all(guests.map((g) => joinTable(g, fx.tables[2]!, 6)))
    const sessionIds = new Set(results.map((r) => r.session_id))
    expect(sessionIds.size).toBe(1)
    expect(results.filter((r) => r.is_new_session)).toHaveLength(1)
    expect(new Set(results.map((r) => r.guest_number)).size).toBe(6)

    const active = must(
      await admin.from('table_sessions').select('id').eq('table_id', fx.tables[2]!).in('status', ['open', 'bill_requested', 'paid']),
    )
    expect(active).toHaveLength(1)
  })

  it('lets a later guest update the party size', async () => {
    const g = await guestClient()
    const j = await joinTable(g, fx.tables[0]!, 5)
    expect(j.party_size).toBe(5)
  })

  it('keeps orders from different guests in one session, each with its own provenance', async () => {
    const fx2 = await createFixture()
    const a = await guestClient()
    const b = await guestClient()
    const c = await guestClient()
    const ja = await joinTable(a, fx2.tables[1]!, 4)
    const jb = await joinTable(b, fx2.tables[1]!)
    const jc = await joinTable(c, fx2.tables[1]!)

    const oa = await placeOrder(a, ja.session_id, [
      { menu_item_id: fx2.items.burger, quantity: 1, modifier_ids: [fx2.modifiers.mediumRare] },
      { menu_item_id: fx2.items.coke, quantity: 1 },
    ])
    const ob = await placeOrder(b, jb.session_id, [{ menu_item_id: fx2.items.fries, quantity: 1 }])
    const oc = await placeOrder(c, jc.session_id, [{ menu_item_id: fx2.items.coke, quantity: 2 }])
    // A adds dessert later — same tab
    const oa2 = await placeOrder(a, ja.session_id, [{ menu_item_id: fx2.items.fries, quantity: 1 }])

    expect([oa.session_seq, ob.session_seq, oc.session_seq, oa2.session_seq]).toEqual([1, 2, 3, 4])
    expect(oa.guest_id).toBe(ja.guest_id)
    expect(ob.guest_id).toBe(jb.guest_id)
    expect(oc.guest_id).toBe(jc.guest_id)
    expect(oa2.guest_id).toBe(ja.guest_id)
    expect(oa2.order_number).toBeGreaterThan(oa.order_number)

    // Every guest at the table sees the whole tab
    const seenByB = must(await b.from('orders').select('id, session_seq').eq('session_id', jb.session_id).order('session_seq'))
    expect(seenByB.map((o) => o.session_seq)).toEqual([1, 2, 3, 4])

    // Staff see it grouped as one table session
    const board = must(await fx2.waiter.rpc('get_table_board', { p_restaurant_id: fx2.restaurantId })) as Array<{
      table_id: string
      session_id: string | null
      pending: number
      state: string
      party_size: number
    }>
    const t2 = board.find((t) => t.table_id === fx2.tables[1])!
    expect(t2.session_id).toBe(ja.session_id)
    expect(t2.pending).toBe(4)
    expect(t2.state).toBe('new_order')
    expect(t2.party_size).toBe(4)
  })

  it('starts a fresh tab for a new party once the previous one has paid', async () => {
    const fx3 = await createFixture()
    const a = await guestClient()
    const ja = await joinTable(a, fx3.tables[0]!, 2)
    await placeOrder(a, ja.session_id, [{ menu_item_id: fx3.items.coke, quantity: 1 }])
    must(await fx3.waiter.rpc('record_manual_payment', { p_session_id: ja.session_id, p_method: 'cash' }))

    // Same phone rescanning still lands on its settled tab (to see the receipt)
    const again = await joinTable(a, fx3.tables[0]!)
    expect(again.session_id).toBe(ja.session_id)

    // A new party gets a new tab; the old one is closed
    const newcomer = await guestClient()
    const jn = await joinTable(newcomer, fx3.tables[0]!, 3)
    expect(jn.session_id).not.toBe(ja.session_id)
    expect(jn.is_new_session).toBe(true)
    const old = must(await admin.from('table_sessions').select('status').eq('id', ja.session_id).single())
    expect(old.status).toBe('closed')
  })

  it('rejects joining a closed restaurant or an inactive table', async () => {
    const fx4 = await createFixture()
    const g = await guestClient()
    must(await fx4.manager.from('restaurant_tables').update({ is_active: false }).eq('id', fx4.tables[2]!).select())
    await expectError(g.rpc('join_table', { p_table_id: fx4.tables[2]! }), 'table_unavailable')

    must(await fx4.manager.rpc('set_restaurant_status', { p_restaurant_id: fx4.restaurantId, p_status: 'closed' }))
    await expectError(g.rpc('join_table', { p_table_id: fx4.tables[0]! }), 'restaurant_closed')
  })

  it('exposes a safe public preview of the table before joining', async () => {
    const anon = (await import('./helpers.ts')).publicClient()
    const entry = must(await anon.rpc('get_table_entry', { p_table_id: fx.tables[0]! })) as {
      table: { label: string }
      restaurant: { slug: string; name: string }
      active_session: { party_size: number; guest_count: number } | null
    }
    expect(entry.table.label).toBe('1')
    expect(entry.restaurant.slug).toBe(fx.slug)
    expect(entry.active_session?.guest_count).toBeGreaterThan(0)
    expect(JSON.stringify(entry)).not.toContain('session_id')
  })
})
