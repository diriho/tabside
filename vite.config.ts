import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { parseEnv } from 'node:util'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

/**
 * Database tests run ONLY against a disposable local Supabase, never the hosted project. Their keys
 * come from `.env.test.local`, written by `npm run db:start` — deliberately not from .env/.env.local,
 * which hold the hosted project's keys.
 */
const testEnvFile = '.env.test.local'
const testEnv: Record<string, string> = existsSync(testEnvFile)
  ? (parseEnv(readFileSync(testEnvFile, 'utf8')) as Record<string, string>)
  : {}

const webPort = Number(process.env.WEB_PORT ?? 5173)
const apiTarget = `http://127.0.0.1:${process.env.API_PORT ?? '8787'}`

// In development the API runs as a separate Node process; the browser reaches it through this proxy.
// (On Vercel, /api/* is served by the serverless function — see scripts/build-vercel.mjs.)
const proxy = { '/api': { target: apiTarget, changeOrigin: true } }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    port: webPort,
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
          // Components never reach a server in these tests; the client just needs syntactically valid config.
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
          env: testEnv,
        },
      },
    ],
  },
})
