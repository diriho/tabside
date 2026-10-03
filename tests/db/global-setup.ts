import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

// DB integration tests create throwaway restaurants and staff accounts. Remove them afterwards
// so the local demo (The Globe, Café Ubuntu) stays clean.
export async function teardown() {
  // Runs in Vitest's main process, which doesn't get the per-project `env` — read .env/.env.local directly.
  const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
  const admin = createClient(
    env.SUPABASE_URL as string,
    env.SUPABASE_SECRET_KEY as string, // cast it into a string type becuase the funcion signature expecets it to be of a string type
    { auth: { persistSession: false } },
  )
  await admin.from('restaurants').delete().or('slug.like.test-%,slug.like.founder-%')
  for (let page = 1; page < 50; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const users = data?.users ?? []
    const testUsers = users.filter((u) => u.email?.endsWith('@tests.tabside'))
    await Promise.all(testUsers.map((u) => admin.auth.admin.deleteUser(u.id)))
    if (users.length < 200) break
  }
}
