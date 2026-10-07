import { defineConfig, devices } from '@playwright/test'
import { localTestEnv } from './tests/local-env.ts'

// Browser tests run the app against the disposable LOCAL Supabase (never the hosted project), on
// their own ports so they can't reuse a dev server that points at live data.
const local = localTestEnv()
const WEB_PORT = '5174'
const API_PORT = '8788'
const baseURL = `http://localhost:${WEB_PORT}`

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
    // Real environment variables override .env/.env.local in both Vite and the API.
    env: {
      WEB_PORT,
      API_PORT,
      APP_URL: baseURL,
      VITE_PUBLIC_APP_URL: baseURL,
      VITE_SUPABASE_URL: local.SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: local.SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_URL: local.SUPABASE_URL,
      SUPABASE_SECRET_KEY: local.SUPABASE_SECRET_KEY,
      SUPABASE_PUBLISHABLE_KEY: local.SUPABASE_PUBLISHABLE_KEY,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? '',
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    },
  },
})
