// Starts the disposable local Supabase used ONLY by the integration tests, then writes its
// connection details to .env.test.local (gitignored). The app itself uses your hosted project.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const supabase = (...args) => execFileSync('npx', ['supabase', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

console.info('Starting local Supabase for tests (Docker/OrbStack must be running)…')
supabase('start', '-x', 'edge-runtime,vector,logflare,imgproxy')
const status = JSON.parse(supabase('status', '-o', 'json'))

const lines = [
  '# Local Supabase for integration tests only — written by `npm run db:start`. Do not point at the hosted project.',
  `SUPABASE_URL=${status.API_URL}`,
  `SUPABASE_SECRET_KEY=${status.SECRET_KEY}`,
  `SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}`,
]
writeFileSync('.env.test.local', lines.join('\n') + '\n')
console.info(`Local Supabase is up at ${status.API_URL}. Wrote .env.test.local. Run \`npm run db:reset\` to load the demo seed, then \`npm run test:db\` / \`npm run test:e2e\`.`)
