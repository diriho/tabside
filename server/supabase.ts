import type { IncomingMessage } from 'node:http'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { Database } from '../src/types/database.ts'
import type { ServerEnv } from './env.ts'
import { bearerToken, HttpError } from './http.ts'

export type AdminClient = SupabaseClient<Database>

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }

/** Service-role client: bypasses RLS. Only ever used server-side. */
export function createAdminClient(env: ServerEnv): AdminClient {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, noSession)
}

/** A client that acts *as the caller* (their JWT), so RLS and RPC role checks apply. */
export function createUserClient(env: ServerEnv, accessToken: string): AdminClient {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

/** Verifies the caller's Supabase JWT with the Auth server. Never trusts client-supplied user ids. */
export async function requireUser(admin: AdminClient, req: IncomingMessage): Promise<{ user: User; token: string }> {
  const token = bearerToken(req)
  if (!token) throw new HttpError(401, 'not_authenticated')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'not_authenticated')
  return { user: data.user, token }
}

/** Maps a Postgres/PostgREST error raised by our RPCs to an HTTP error with the same code. */
export function rpcError(error: { message: string; code?: string }): HttpError {
  const code = /^[a-z_]+$/.test(error.message) ? error.message : 'database_error'
  const status = code === 'forbidden' ? 403 : code.endsWith('_not_found') ? 404 : code === 'database_error' ? 500 : 409
  return new HttpError(status, code, error.message)
}
