import { createClient } from '@supabase/supabase-js'
import { localTestEnv } from '../local-env.ts'

// DB integration tests create throwaway restaurants and staff accounts. Remove them afterwards
// so the local demo (The Globe, Café Ubuntu) stays clean.
export async function teardown() {
  // Local, disposable Supabase only (guarded in localTestEnv).
  const env = localTestEnv()
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
  await admin.from('restaurants').delete().or('slug.like.test-%,slug.like.founder-%')
  for (let page = 1; page < 50; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const users = data?.users ?? []
    const testUsers = users.filter((u) => u.email?.endsWith('@tests.tabside'))
    await Promise.all(testUsers.map((u) => admin.auth.admin.deleteUser(u.id)))
    if (users.length < 200) break
  }
}
