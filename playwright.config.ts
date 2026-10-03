import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

// Playwright doesn't read env files; load .env + .env.local so tests can reach local Supabase.
// Variables already set in the shell win.
for (const [key, value] of Object.entries(loadEnv('development', process.cwd(), ''))) process.env[key] ??= value

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
