import type Stripe from 'stripe'
import { fromStripeAmount, toStripeAmount } from '../shared/stripe-amount.ts'
import { HttpError } from './http.ts'
import { rpcError, type AdminClient } from './supabase.ts'

export interface PaymentDeps {
  admin: AdminClient
  stripe: Stripe
  appUrl: string
}

interface PreparedPayment {
  payment_id: string
  amount_minor: number
  currency: string
  restaurant_name: string
  restaurant_id: string
  table_label: string
}

/**
 * Starts a Stripe Checkout for everything currently due on the table.
 * The amount comes from the database, never from the client.
 */
export async function createCheckout(
  deps: PaymentDeps,
  input: { sessionId: string; userId: string },
): Promise<{ url: string; paymentId: string }> {
  const { data, error } = await deps.admin.rpc('stripe_prepare_payment', {
    p_session_id: input.sessionId,
    p_user_id: input.userId,
  })
  if (error) throw rpcError(error)
  const prepared = data as unknown as PreparedPayment

  const returnBase = `${deps.appUrl.replace(/\/$/, '')}/session/${input.sessionId}/bill`
  let checkout: Stripe.Checkout.Session
  try {
    checkout = await deps.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: prepared.payment_id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: prepared.currency.toLowerCase(),
              unit_amount: toStripeAmount(prepared.amount_minor, prepared.currency),
              product_data: {
                name: `${prepared.restaurant_name} — Table ${prepared.table_label}`,
                description: 'Your table’s tab',
              },
            },
          },
        ],
        metadata: { payment_id: prepared.payment_id, table_session_id: input.sessionId, restaurant_id: prepared.restaurant_id },
        payment_intent_data: {
          metadata: { payment_id: prepared.payment_id, table_session_id: input.sessionId, restaurant_id: prepared.restaurant_id },
        },
        success_url: `${returnBase}?checkout=success&payment=${prepared.payment_id}`,
        cancel_url: `${returnBase}?checkout=cancelled&payment=${prepared.payment_id}`,
        // Stripe's minimum; matches the 35-minute "checkout in progress" window in the database.
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      },
      { idempotencyKey: `checkout-${prepared.payment_id}` },
    )
  } catch (err) {
    await deps.admin.rpc('stripe_fail_payment', {
      p_payment_id: prepared.payment_id,
      p_status: 'failed',
      p_reason: err instanceof Error ? err.message : 'stripe_error',
    })
    throw new HttpError(502, 'payment_provider_error', err instanceof Error ? err.message : undefined)
  }

  const { error: attachError } = await deps.admin.rpc('stripe_attach_checkout', {
    p_payment_id: prepared.payment_id,
    p_checkout_session_id: checkout.id,
  })
  if (attachError) throw rpcError(attachError)
  if (!checkout.url) throw new HttpError(502, 'payment_provider_error', 'Checkout session has no URL')

  return { url: checkout.url, paymentId: prepared.payment_id }
}

export type SettlementResult =
  | { outcome: 'completed'; paymentId: string; sessionPaid: boolean; alreadyProcessed: boolean }
  | { outcome: 'failed' | 'cancelled'; paymentId: string }
  | { outcome: 'pending'; paymentId: string }
  | { outcome: 'ignored'; reason: string }

/** Applies a Checkout Session's state to our payment row. Idempotent. */
export async function settleCheckoutSession(admin: AdminClient, session: Stripe.Checkout.Session): Promise<SettlementResult> {
  const paymentId = session.metadata?.payment_id ?? session.client_reference_id
  if (!paymentId) return { outcome: 'ignored', reason: 'no_payment_reference' }

  if (session.status === 'expired') {
    await admin.rpc('stripe_fail_payment', { p_payment_id: paymentId, p_status: 'cancelled', p_reason: 'checkout_expired' })
    return { outcome: 'cancelled', paymentId }
  }
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return { outcome: 'pending', paymentId }
  }
  if (session.amount_total === null || !session.currency) return { outcome: 'ignored', reason: 'missing_amount' }

  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
  const { data, error } = await admin.rpc('stripe_complete_payment', {
    p_payment_id: paymentId,
    p_checkout_session_id: session.id,
    p_payment_intent_id: paymentIntent ?? '',
    p_amount_minor: fromStripeAmount(session.amount_total, session.currency),
    p_currency: session.currency.toUpperCase(),
  })
  if (error) {
    if (error.message === 'payment_not_found') return { outcome: 'ignored', reason: 'payment_not_found' }
    throw rpcError(error)
  }
  const result = data as { already_processed: boolean; session_paid?: boolean }
  return { outcome: 'completed', paymentId, sessionPaid: result.session_paid ?? true, alreadyProcessed: result.already_processed }
}

/** Webhook entry point: verify the signature, then settle. */
export async function handleWebhook(
  deps: Pick<PaymentDeps, 'admin' | 'stripe'>,
  rawBody: Buffer,
  signature: string | undefined,
  webhookSecret: string,
): Promise<SettlementResult> {
  if (!signature) throw new HttpError(400, 'missing_signature')
  let event: Stripe.Event
  try {
    event = deps.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch {
    throw new HttpError(400, 'invalid_signature')
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.expired':
      return settleCheckoutSession(deps.admin, event.data.object)
    case 'checkout.session.async_payment_failed': {
      const paymentId = event.data.object.metadata?.payment_id
      if (!paymentId) return { outcome: 'ignored', reason: 'no_payment_reference' }
      await deps.admin.rpc('stripe_fail_payment', { p_payment_id: paymentId, p_status: 'failed', p_reason: 'async_payment_failed' })
      return { outcome: 'failed', paymentId }
    }
    default:
      return { outcome: 'ignored', reason: `unhandled:${event.type}` }
  }
}

/**
 * Fallback for when a guest returns from Checkout before the webhook lands (or webhooks
 * aren't forwarded locally): ask Stripe directly. Only the guest who started it may sync.
 */
export async function syncPayment(deps: PaymentDeps, input: { paymentId: string; userId: string }): Promise<SettlementResult> {
  const { data: payment, error } = await deps.admin
    .from('payments')
    .select('id, method, initiated_by, stripe_checkout_session_id, status')
    .eq('id', input.paymentId)
    .maybeSingle()
  if (error) throw rpcError(error)
  if (!payment || payment.method !== 'stripe' || payment.initiated_by !== input.userId) {
    throw new HttpError(404, 'payment_not_found')
  }
  if (payment.status === 'succeeded') {
    return { outcome: 'completed', paymentId: payment.id, sessionPaid: true, alreadyProcessed: true }
  }
  if (!payment.stripe_checkout_session_id) return { outcome: 'pending', paymentId: payment.id }
  const session = await deps.stripe.checkout.sessions.retrieve(payment.stripe_checkout_session_id)
  return settleCheckoutSession(deps.admin, session)
}
