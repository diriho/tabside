import { z } from 'zod'

const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(10),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  APP_URL: z.url().default('http://localhost:5173'),
  API_PORT: z.coerce.number().int().positive().default(8787),
  // Loopback only: the browser reaches the API through the Vite proxy (or your reverse proxy in
  // production), so it never needs to accept connections from the network directly.
  API_HOST: z.string().default('127.0.0.1'),
  STRIPE_SECRET_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  STRIPE_WEBHOOK_SECRET: z.string().optional().transform((v) => (v ? v : undefined)),
})

export type ServerEnv = z.infer<typeof schema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  // On Vercel, APP_URL defaults to the production domain (or this deployment's URL for previews).
  const vercelUrl = source.VERCEL_ENV === 'production' && source.VERCEL_PROJECT_PRODUCTION_URL
    ? source.VERCEL_PROJECT_PRODUCTION_URL
    : source.VERCEL_URL
  const parsed = schema.safeParse({
    ...source,
    SUPABASE_URL: source.SUPABASE_URL ?? source.VITE_SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: source.SUPABASE_PUBLISHABLE_KEY ?? source.VITE_SUPABASE_ANON_KEY,
    APP_URL: source.APP_URL ?? (vercelUrl ? `https://${vercelUrl}` : undefined),
  })
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid server environment:\n${issues}\nSee .env.example.`)
  }
  if (parsed.data.STRIPE_SECRET_KEY && !/^(sk|rk)_test_/.test(parsed.data.STRIPE_SECRET_KEY) && source.NODE_ENV !== 'production') {
    console.warn('[api] STRIPE_SECRET_KEY is not a test key — use sk_test_… while developing.')
  }
  return parsed.data
}
