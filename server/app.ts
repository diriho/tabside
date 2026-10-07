import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import Stripe from 'stripe'
import { z } from 'zod'
import type { ServerEnv } from './env.ts'
import { HttpError, readJson, readRawBody, Router, sendJson } from './http.ts'
import { createCheckout, handleWebhook, syncPayment } from './payments.ts'
import { createStaffMember, createStaffSchema } from './staff.ts'
import { createAdminClient, createUserClient, requireUser } from './supabase.ts'

const checkoutSchema = z.object({ sessionId: z.uuid() })
const syncSchema = z.object({ paymentId: z.uuid() })

/** Every API path. The Vercel build mounts the serverless function at each of these. */
export const API_ROUTES = [
  '/api/health',
  '/api/config',
  '/api/payments/checkout',
  '/api/payments/sync',
  '/api/stripe/webhook',
  '/api/staff',
] as const

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/** The API as a plain (req, res) handler — used by the local Node server and the Vercel function. */
export function createHandler(env: ServerEnv, overrides: { stripe?: Stripe } = {}): RequestHandler {
  const admin = createAdminClient(env)
  const stripe = overrides.stripe ?? (env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : undefined)

  function requireStripe(): Stripe {
    if (!stripe) throw new HttpError(503, 'payments_not_configured', 'Online payments are not configured on this server.')
    return stripe
  }

  const router = new Router()
    .on('GET', '/api/health', async (_req, res) => {
      sendJson(res, 200, { ok: true })
    })
    .on('GET', '/api/config', async (_req, res) => {
      sendJson(res, 200, { onlinePayments: Boolean(stripe), webhooks: Boolean(env.STRIPE_WEBHOOK_SECRET) })
    })
    .on('POST', '/api/payments/checkout', async (req, res) => {
      const { user } = await requireUser(admin, req)
      const body = checkoutSchema.safeParse(await readJson(req))
      if (!body.success) throw new HttpError(400, 'invalid_request')
      const result = await createCheckout(
        { admin, stripe: requireStripe(), appUrl: env.APP_URL },
        { sessionId: body.data.sessionId, userId: user.id },
      )
      sendJson(res, 200, result)
    })
    .on('POST', '/api/payments/sync', async (req, res) => {
      const { user } = await requireUser(admin, req)
      const body = syncSchema.safeParse(await readJson(req))
      if (!body.success) throw new HttpError(400, 'invalid_request')
      const result = await syncPayment(
        { admin, stripe: requireStripe(), appUrl: env.APP_URL },
        { paymentId: body.data.paymentId, userId: user.id },
      )
      sendJson(res, 200, result)
    })
    .on('POST', '/api/stripe/webhook', async (req, res) => {
      if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'webhooks_not_configured')
      const raw = await readRawBody(req)
      const signature = req.headers['stripe-signature']
      const result = await handleWebhook(
        { admin, stripe: requireStripe() },
        raw,
        Array.isArray(signature) ? signature[0] : signature,
        env.STRIPE_WEBHOOK_SECRET,
      )
      if (result.outcome !== 'ignored') console.info('[stripe]', result)
      sendJson(res, 200, { received: true })
    })
    .on('POST', '/api/staff', async (req, res) => {
      const { token } = await requireUser(admin, req)
      const body = createStaffSchema.safeParse(await readJson(req))
      if (!body.success) {
        throw new HttpError(400, 'invalid_request', body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
      }
      const result = await createStaffMember(admin, createUserClient(env, token), body.data)
      sendJson(res, 201, result)
    })

  const allowedOrigin = new URL(env.APP_URL).origin

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const origin = req.headers.origin
    if (origin === allowedOrigin) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('vary', 'origin')
      res.setHeader('access-control-allow-headers', 'authorization, content-type')
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }

    const match = router.match(req.method ?? 'GET', url.pathname)
    if (!match) {
      sendJson(res, 404, { error: 'not_found' })
      return
    }
    try {
      await match.handler(req, res, match.params)
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status >= 500) console.error('[api]', err.code, err.message)
        sendJson(res, err.status, { error: err.code, message: err.message })
        return
      }
      console.error('[api] unexpected error', err)
      sendJson(res, 500, { error: 'internal_error' })
    }
  }
}

/** Local/standalone server wrapping the same handler. */
export function createApp(env: ServerEnv, overrides: { stripe?: Stripe } = {}): Server {
  const handle = createHandler(env, overrides)
  return createServer((req, res) => {
    void handle(req, res)
  })
}
