// Produces Vercel's Build Output API (v3) from the Vite build + the Node API.
//   .vercel/output/static     → the SPA (dist/)
//   .vercel/output/functions  → one bundled Node function, mounted at every API path
//   .vercel/output/config.json→ routing, SPA fallback, security & cache headers
// Run after `vite build` (see the "build:vercel" npm script). Docs: vercel.com/docs/build-output-api
import { cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { build } from 'rolldown'
import { loadEnv } from 'vite'
import { API_ROUTES } from '../server/app.ts'

const OUT = '.vercel/output'
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env }

await rm(OUT, { recursive: true, force: true })

// 1. Static site
await cp('dist', join(OUT, 'static'), { recursive: true })

// 2. API function: bundle everything (deps included) into one ESM file so it needs no node_modules.
const [first, ...others] = API_ROUTES
const baseFunc = join(OUT, 'functions', `${first.slice(1)}.func`)
await build({
  input: 'server/vercel.ts',
  platform: 'node',
  logLevel: 'warn',
  output: {
    file: join(baseFunc, 'index.mjs'),
    format: 'esm',
    // Some bundled CommonJS packages call require() for Node built-ins.
    banner: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
})
await writeFile(
  join(baseFunc, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 15 }, null, 2),
)
// Mount the same function at every other API path (symlinks are supported by the Build Output API).
for (const route of others) {
  const funcDir = join(OUT, 'functions', `${route.slice(1)}.func`)
  await mkdir(dirname(funcDir), { recursive: true })
  await symlink(relative(dirname(funcDir), baseFunc), funcDir)
}

// 3. Routing and headers
const supabaseOrigin = (() => {
  try {
    return new URL(env.VITE_SUPABASE_URL).origin
  } catch {
    return 'https://*.supabase.co'
  }
})()
const supabaseWs = supabaseOrigin.replace(/^https:/, 'wss:')

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`,
  `object-src 'self' ${supabaseOrigin}`,
  `frame-src 'self' ${supabaseOrigin}`,
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = {
  'Content-Security-Policy': csp,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
}

const config = {
  version: 3,
  routes: [
    // Hashed build assets never change: cache forever.
    { src: '^/assets/(.*)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '^/(.*)$', headers: securityHeaders, continue: true },
    { handle: 'filesystem' },
    // Unknown API paths are a 404, not the app shell.
    { src: '^/api(/.*)?$', status: 404 },
    // Everything else is a client-side route.
    { src: '^/(.*)$', dest: '/index.html' },
  ],
}
await writeFile(join(OUT, 'config.json'), JSON.stringify(config, null, 2))

console.info(`[vercel] wrote ${OUT}: static site, 1 function mounted at ${API_ROUTES.length} paths, CSP for ${supabaseOrigin}`)
