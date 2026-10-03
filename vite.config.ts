import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage } from 'node:http'
import { loadEnv, type ProxyOptions } from 'vite'
import { defineConfig } from 'vitest/config'

// DB tests talk to the local Supabase stack. Vitest's test mode skips .env.local and only exposes
// VITE_* variables, so load .env + .env.local explicitly and pass just the keys those tests need.
const localEnv = loadEnv('development', process.cwd(), '')
const dbTestEnv = {
  SUPABASE_URL: localEnv.SUPABASE_URL ?? '',
  SUPABASE_SECRET_KEY: localEnv.SUPABASE_SECRET_KEY ?? '',
  VITE_SUPABASE_ANON_KEY: localEnv.VITE_SUPABASE_ANON_KEY ?? '',
}

const apiTarget = `http://127.0.0.1:${process.env.API_PORT ?? '8787'}`

/**
 * The browser only ever uses the publishable key (plus user JWTs). Local Supabase's admin keys are
 * the same on every machine and publicly documented, so refuse them at the proxy — otherwise anyone
 * reaching this dev server (dev:lan or a tunnel) could take over the local database.
 */
function carriesAdminKey(req: IncomingMessage): boolean {
  const query = new URL(req.url ?? '/', 'http://local').searchParams
  const apikey = String(req.headers.apikey ?? query.get('apikey') ?? '')
  const bearer = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (apikey.startsWith('sb_secret_') || bearer.startsWith('sb_secret_')) return true
  return [apikey, bearer].some((token) => {
    const payload = token.split('.')[1]
    if (!payload) return false
    try {
      return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role === 'service_role'
    } catch {
      return false
    }
  })
}

// Same-origin proxies: the browser (including a phone on your Wi-Fi or a tunnel) only ever talks to
// this server; it forwards /api to the Node API and /supabase to the local Supabase stack.
const proxy: Record<string, ProxyOptions> = {
  '/api': { target: apiTarget, changeOrigin: true },
  '/supabase': {
    target: localEnv.SUPABASE_URL || 'http://127.0.0.1:54321',
    changeOrigin: true,
    ws: true,
    rewrite: (path: string) => path.replace(/^\/supabase/, ''),
    configure: (proxyServer) => {
      proxyServer.on('proxyReq', (proxyReq, req, res) => {
        if (!carriesAdminKey(req)) return
        proxyReq.destroy()
        res.writeHead(403, { 'content-type': 'text/plain' }).end('Admin keys are not accepted through the dev proxy.')
      })
      proxyServer.on('proxyReqWs', (proxyReq, req, socket) => {
        if (!carriesAdminKey(req)) return
        proxyReq.destroy()
        socket.destroy()
      })
    },
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Allow quick tunnels (cloudflared / ngrok) when testing on a phone off your network.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app'],
    proxy,
  },
  preview: {
    port: 4173,
    proxy,
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          include: ['tests/ui/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/ui/setup.ts'],
          env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'test-key' },
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
          globalSetup: ['tests/db/global-setup.ts'],
          env: dbTestEnv,
        },
      },
    ],
  },
})
