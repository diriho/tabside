import { createApp } from './app.ts'
import { loadEnv } from './env.ts'

const env = loadEnv()
const server = createApp(env)

server.listen(env.API_PORT, env.API_HOST, () => {
  console.info(`[api] listening on http://${env.API_HOST}:${env.API_PORT}`)
  if (!env.STRIPE_SECRET_KEY) console.info('[api] STRIPE_SECRET_KEY not set — "Pay online" is disabled; "Request check" still works.')
  else if (!env.STRIPE_WEBHOOK_SECRET) console.info('[api] STRIPE_WEBHOOK_SECRET not set — run `npm run stripe:listen` to receive webhooks.')
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
