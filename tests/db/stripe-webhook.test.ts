import type { AddressInfo } from 'node:net'
import Stripe from 'stripe'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.ts'
import { loadEnv } from '../../server/env.ts'
import { admin, createFixture, guestClient, joinTable, must, placeOrder } from './helpers.ts'

const WEBHOOK_SECRET = 'whsec_test_tabside'
// constructEvent / generateTestHeaderString are local crypto — no network calls to Stripe here.
const stripe = new Stripe('sk_test_dummy_for_signatures')

const env = loadEnv({
  SUPABASE_URL: process.env.SUPABASE_URL as string, // cast it into a string type becuase the funcion signature expecets it to be of a string type
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY as string, // cast it into a string type becuase the funcion signature expecets it to be of a string type
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY as string, // cast it into a string type becuase the funcion signature expecets it to be of a string type
  STRIPE_SECRET_KEY: 'sk_test_dummy_for_signatures',
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
})

const server = createApp(env, { stripe })
let baseUrl: string

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

async function pendingPayment(currency = 'USD') {
  const fx = await createFixture({ currency })
  const g = await guestClient()
  const j = await joinTable(g, fx.tables[0]!, 2)
  await placeOrder(g, j.session_id, [{ menu_item_id: fx.items.coke, quantity: 2 }])
  const { data: u } = await g.auth.getUser()
  const prep = must(await admin.rpc('stripe_prepare_payment', { p_session_id: j.session_id, p_user_id: u.user!.id })) as {
    payment_id: string
    amount_minor: number
  }
  const checkoutId = `cs_test_${prep.payment_id.slice(0, 8)}`
  await admin.rpc('stripe_attach_checkout', { p_payment_id: prep.payment_id, p_checkout_session_id: checkoutId })
  return { fx, g, sessionId: j.session_id, paymentId: prep.payment_id, amount: prep.amount_minor, checkoutId }
}

function checkoutEvent(type: string, session: Record<string, unknown>) {
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    object: 'event',
    type,
    api_version: '2025-01-01',
    created: Math.floor(Date.now() / 1000),
    data: { object: { object: 'checkout.session', ...session } },
  })
}

async function postWebhook(payload: string, signature?: string) {
  return fetch(`${baseUrl}/api/stripe/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature ?? stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }),
    },
    body: payload,
  })
}

describe('POST /api/stripe/webhook', () => {
  it('marks the payment succeeded and the table paid, idempotently', async () => {
    const { g, sessionId, paymentId, amount, checkoutId } = await pendingPayment()
    expect(amount).toBe(660)

    const payload = checkoutEvent('checkout.session.completed', {
      id: checkoutId, status: 'complete', payment_status: 'paid', amount_total: 660, currency: 'usd',
      payment_intent: 'pi_test_123', metadata: { payment_id: paymentId }, client_reference_id: paymentId,
    })
    expect((await postWebhook(payload)).status).toBe(200)
    expect((await postWebhook(payload)).status).toBe(200) // Stripe retries are no-ops

    const payments = must(await admin.from('payments').select('status, stripe_payment_intent_id').eq('session_id', sessionId))
    expect(payments).toEqual([{ status: 'succeeded', stripe_payment_intent_id: 'pi_test_123' }])
    const bill = must(await g.rpc('session_bill', { p_session_id: sessionId })) as { status: string; due_minor: number }
    expect(bill).toMatchObject({ status: 'paid', due_minor: 0 })
  })

  it('rejects unsigned or tampered events', async () => {
    const { sessionId, paymentId, checkoutId } = await pendingPayment()
    const payload = checkoutEvent('checkout.session.completed', {
      id: checkoutId, status: 'complete', payment_status: 'paid', amount_total: 660, currency: 'usd', metadata: { payment_id: paymentId },
    })
    const bad = await postWebhook(payload, 't=1,v1=deadbeef')
    expect(bad.status).toBe(400)
    const signedOther = stripe.webhooks.generateTestHeaderString({ payload: payload.replace('660', '1'), secret: WEBHOOK_SECRET })
    expect((await postWebhook(payload, signedOther)).status).toBe(400)

    const payments = must(await admin.from('payments').select('status').eq('session_id', sessionId))
    expect(payments).toEqual([{ status: 'pending' }])
  })

  it('refuses to settle when Stripe’s amount differs from what was due', async () => {
    const { sessionId, paymentId, checkoutId } = await pendingPayment()
    const payload = checkoutEvent('checkout.session.completed', {
      id: checkoutId, status: 'complete', payment_status: 'paid', amount_total: 1, currency: 'usd', metadata: { payment_id: paymentId },
    })
    expect((await postWebhook(payload)).status).toBe(409)
    const payments = must(await admin.from('payments').select('status').eq('session_id', sessionId))
    expect(payments).toEqual([{ status: 'pending' }])
  })

  it('cancels the pending payment when the checkout expires', async () => {
    const { sessionId, paymentId, checkoutId } = await pendingPayment()
    const payload = checkoutEvent('checkout.session.expired', {
      id: checkoutId, status: 'expired', payment_status: 'unpaid', amount_total: 660, currency: 'usd', metadata: { payment_id: paymentId },
    })
    expect((await postWebhook(payload)).status).toBe(200)
    const payments = must(await admin.from('payments').select('status').eq('session_id', sessionId))
    expect(payments).toEqual([{ status: 'cancelled' }])
  })

  it('converts zero-decimal currencies correctly (BIF)', async () => {
    const { g, sessionId, paymentId, amount, checkoutId } = await pendingPayment('BIF')
    const payload = checkoutEvent('checkout.session.completed', {
      id: checkoutId, status: 'complete', payment_status: 'paid', amount_total: amount, currency: 'bif',
      payment_intent: 'pi_bif', metadata: { payment_id: paymentId },
    })
    expect((await postWebhook(payload)).status).toBe(200)
    const bill = must(await g.rpc('session_bill', { p_session_id: sessionId })) as { status: string; currency: string }
    expect(bill).toMatchObject({ status: 'paid', currency: 'BIF' })
  })
})

describe('POST /api/payments/checkout', () => {
  it('requires a signed-in guest of the session', async () => {
    const res = await fetch(`${baseUrl}/api/payments/checkout`, { method: 'POST', body: JSON.stringify({ sessionId: crypto.randomUUID() }) })
    expect(res.status).toBe(401)
    const stranger = await guestClient()
    const { data } = await stranger.auth.getSession()
    const res2 = await fetch(`${baseUrl}/api/payments/checkout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${data.session!.access_token}` },
      body: JSON.stringify({ sessionId: crypto.randomUUID() }),
    })
    expect(res2.status).toBe(404)
    expect(((await res2.json()) as { error: string }).error).toBe('session_not_found')
  })
})

describe('POST /api/staff', () => {
  it('lets a manager create a kitchen account that can then sign in, and blocks non-managers', async () => {
    const fx = await createFixture()
    const { data: m } = await fx.manager.auth.getSession()
    const email = `chef-${Date.now()}@tests.tabside`
    const res = await fetch(`${baseUrl}/api/staff`, {
      method: 'POST',
      headers: { authorization: `Bearer ${m.session!.access_token}` },
      body: JSON.stringify({ restaurantId: fx.restaurantId, email, displayName: 'Chef Test', role: 'kitchen', password: 'kitchen-pass-1' }),
    })
    expect(res.status).toBe(201)

    const { data: k } = await fx.kitchen.auth.getSession()
    const denied = await fetch(`${baseUrl}/api/staff`, {
      method: 'POST',
      headers: { authorization: `Bearer ${k.session!.access_token}` },
      body: JSON.stringify({ restaurantId: fx.restaurantId, email: `x-${Date.now()}@tests.tabside`, displayName: 'X', role: 'manager', password: 'whatever-123' }),
    })
    expect(denied.status).toBe(403)

    const staff = must(await fx.manager.from('staff_members').select('display_name, role').eq('restaurant_id', fx.restaurantId).eq('email', email).single())
    expect(staff).toEqual({ display_name: 'Chef Test', role: 'kitchen' })
  })
})
