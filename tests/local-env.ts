import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

export interface LocalTestEnv {
  SUPABASE_URL: string
  SUPABASE_SECRET_KEY: string
  SUPABASE_PUBLISHABLE_KEY: string
}

/**
 * Keys for the disposable LOCAL Supabase used by the database and browser tests. They come only from
 * `.env.test.local` (written by `npm run db:start`), never from .env/.env.local, which point at the
 * hosted project. Anything that isn't a localhost URL is refused: these tests create and delete data.
 */
export function localTestEnv(): LocalTestEnv {
  const file = '.env.test.local'
  if (!existsSync(file)) {
    throw new Error('Integration tests need the local Supabase stack. Run `npm run db:start` first (it writes .env.test.local).')
  }
  const env = parseEnv(readFileSync(file, 'utf8')) as Partial<LocalTestEnv>
  const url = env.SUPABASE_URL ?? ''
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
    throw new Error(`Refusing to run integration tests against "${url || 'no URL'}": they must only target a local Supabase.`)
  }
  if (!env.SUPABASE_SECRET_KEY || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error(`${file} is incomplete — rerun \`npm run db:start\`.`)
  return env as LocalTestEnv
}
