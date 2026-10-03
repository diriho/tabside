import { describe, expect, it } from 'vitest'
import { admin, createFixture, expectError, guestClient, joinTable, must, placeOrder } from './helpers.ts'

interface Bill {
  status: string
  currency: string
  subtotal_minor: number
  exclusive_tax_minor: number
  inclusive_tax_minor: number
  total_minor: number
  paid_minor: number
  due_minor: number
  order_count: number
  taxes: Array<{ name: string; amount_minor: number }>
}

async function setup() {
  const fx = await createFixture()
  const a = await guestClient()
  const b = await guestClient()
  const ja = await joinTable(a, fx.tables[1]!, 2)
  await joinTable(b, fx.tables[1]!)
  await placeOrder(a, ja.session_id, [{ menu_item_id: fx.items.burger, quantity: 1, modifier_ids: [fx.modifiers.mediumRare] }])
  await placeOrder(b, ja.session_id, [{ menu_item_id: fx.items.beer, quantity: 2 }])
  return { fx, a, b, sessionId: ja.session_id }
}

describe('bill', () => {
  it('sums every guest’s orders into one table bill with a tax breakdown', async () => {
    const { a, b, sessionId } = await setup()
    const billA = must(await a.rpc('session_bill', { p_session_id: sessionId })) as unknown as Bill
    const billB = must(await b.rpc('session_bill', { p_session_id: sessionId })) as unknown as Bill
    expect(billA).toEqual(billB)
    // 1400 + 1600 = 3000 subtotal; sales 10% = 300; liquor 5% of 1600 = 80
    expect(billA).toMatchObject({ subtotal_minor: 3000, exclusive_tax_minor: 380, total_minor: 3380, paid_minor: 0, due_minor: 3380, order_count: 2 })
    expect(billA.taxes.map((t) => [t.name, t.amount_minor])).toEqual([['Sales tax', 300], ['Liquor tax', 80]])
  })

  it('request check flags the table for staff', async () => {
    const { fx, a, sessionId } = await setup()
    must(await a.rpc('request_assistance', { p_session_id: sessionId, p_type: 'bill', p_preferred_method: 'card' }))
    // asking twice doesn't duplicate
    must(await a.rpc('request_assistance', { p_session_id: sessionId, p_type: 'bill' }))
    const reqs = must(await fx.waiter.from('table_requests').select('id, status').eq('session_id', sessionId))
    expect(reqs).toHaveLength(1)

    const board = must(await fx.waiter.rpc('get_table_board', { p_restaurant_id: fx.restaurantId })) as Array<{ session_id: string; state: string; preferred_method: string }>
    expect(board.find((t) => t.session_id === sessionId)).toMatchObject({ state: 'bill_requested', preferred_method: 'card' })

    const notes = must(await fx.waiter.from('notifications').select('type, title').eq('session_id', sessionId).eq('type', 'request.bill'))
    expect(notes[0]?.title).toBe('Bill requested — Table 2')
  })
})

describe('manual payments', () => {
  it('only marks the tab paid when staff confirm the full amount', async () => {
    const { fx, a, sessionId } = await setup()
    await expectError(fx.kitchen.rpc('record_manual_payment', { p_session_id: sessionId, p_method: 'cash' }), 'forbidden')
    await expectError(fx.waiter.rpc('record_manual_payment', { p_session_id: sessionId, p_method: 'cash', p_amount_minor: 999999 }), 'invalid_amount')

    must(await fx.waiter.rpc('record_manual_payment', { p_session_id: sessionId, p_method: 'cash', p_amount_minor: 2000 }))
    let bill = must(await a.rpc('session_bill', { p_session_id: sessionId })) as unknown as Bill
    expect(bill).toMatchObject({ status: 'open', paid_minor: 2000, due_minor: 1380 })

    must(await fx.waiter.rpc('record_manual_payment', { p_session_id: sessionId, p_method: 'card' }))
    bill = must(await a.rpc('session_bill', { p_session_id: sessionId })) as unknown as Bill
    expect(bill).toMatchObject({ status: 'paid', paid_minor: 3380, due_minor: 0 })

    const guestNote = must(await a.from('notifications').select('type').eq('session_id', sessionId).eq('type', 'session.paid').eq('audience', 'session'))
    expect(guestNote).toHaveLength(1)
  })

  it('ordering again after paying reopens the tab with a new balance', async () => {
    const { fx, a, sessionId } = await setup()
    must(await fx.waiter.rpc('record_manual_payment', { p_session_id: sessionId, p_method: 'cash' }))
    await placeOrder(a, sessionId, [{ menu_item_id: fx.items.coke, quantity: 1 }])
    const bill = must(await a.rpc('session_bill', { p_session_id: sessionId })) as unknown as Bill
    expect(bill).toMatchObject({ status: 'open', due_minor: 330 })
  })

  it('closing a tab with a balance needs a manager override', async () => {
    const { fx, sessionId } = await setup()
    await expectError(fx.waiter.rpc('close_session', { p_session_id: sessionId }), 'balance_due')
    await expectError(fx.waiter.rpc('close_session', { p_session_id: sessionId, p_force: true }), 'forbidden')
    must(await fx.manager.rpc('close_session', { p_session_id: sessionId, p_force: true }).then((r) => ({ ...r, data: true })))
  })
})

describe('stripe settlement (service role)', () => {
  it('prepares a pending payment for the amount due and completes idempotently', async () => {
    const { fx, a, sessionId } = await setup()
    const { data: user } = await a.auth.getUser()
    const prep = must(await admin.rpc('stripe_prepare_payment', { p_session_id: sessionId, p_user_id: user.user!.id })) as {
      payment_id: string; amount_minor: number; currency: string
    }
    expect(prep).toMatchObject({ amount_minor: 3380, currency: 'USD' })
    must(await admin.rpc('stripe_attach_checkout', { p_payment_id: prep.payment_id, p_checkout_session_id: 'cs_test_1' }).then((r) => ({ ...r, data: true })))

    // a second phone can't start a parallel checkout
    const b2 = await guestClient()
    await joinTable(b2, fx.tables[1]!)
    const { data: u2 } = await b2.auth.getUser()
    await expectError(admin.rpc('stripe_prepare_payment', { p_session_id: sessionId, p_user_id: u2.user!.id }), 'payment_in_progress')

    await expectError(
      admin.rpc('stripe_complete_payment', { p_payment_id: prep.payment_id, p_checkout_session_id: 'cs_test_1', p_payment_intent_id: 'pi_1', p_amount_minor: 1, p_currency: 'USD' }),
      'amount_mismatch',
    )
    const first = must(await admin.rpc('stripe_complete_payment', {
      p_payment_id: prep.payment_id, p_checkout_session_id: 'cs_test_1', p_payment_intent_id: 'pi_1', p_amount_minor: 3380, p_currency: 'usd',
    })) as { already_processed: boolean; session_paid: boolean }
    expect(first).toEqual({ payment_id: prep.payment_id, already_processed: false, session_paid: true })

    const replay = must(await admin.rpc('stripe_complete_payment', {
      p_payment_id: prep.payment_id, p_checkout_session_id: 'cs_test_1', p_payment_intent_id: 'pi_1', p_amount_minor: 3380, p_currency: 'usd',
    })) as { already_processed: boolean }
    expect(replay.already_processed).toBe(true)

    const payments = must(await admin.from('payments').select('status, amount_minor').eq('session_id', sessionId))
    expect(payments.filter((p) => p.status === 'succeeded')).toHaveLength(1)
    const bill = must(await a.rpc('session_bill', { p_session_id: sessionId })) as unknown as Bill
    expect(bill.status).toBe('paid')
  })

  it('refuses to prepare a payment for someone outside the session', async () => {
    const { sessionId } = await setup()
    const stranger = await guestClient()
    const { data } = await stranger.auth.getUser()
    await expectError(admin.rpc('stripe_prepare_payment', { p_session_id: sessionId, p_user_id: data.user!.id }), 'session_not_found')
  })

  it('handles zero-decimal currencies and inclusive VAT', async () => {
    const fx = await createFixture({ currency: 'BIF', inclusiveVat: true })
    const g = await guestClient()
    const j = await joinTable(g, fx.tables[0]!, 2)
    // 1400 BIF burger, VAT 18% included → net = round(1400 / 1.18) = 1186, VAT 214
    const order = await placeOrder(g, j.session_id, [{ menu_item_id: fx.items.burger, quantity: 1, modifier_ids: [fx.modifiers.wellDone] }])
    expect(order).toMatchObject({ subtotal_minor: 1400, inclusive_tax_minor: 214, exclusive_tax_minor: 0, total_minor: 1400 })
    const bill = must(await g.rpc('session_bill', { p_session_id: j.session_id })) as unknown as Bill
    expect(bill).toMatchObject({ currency: 'BIF', total_minor: 1400, inclusive_tax_minor: 214 })
  })
})
