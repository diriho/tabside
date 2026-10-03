import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when Supabase is reached through this app's own origin (the dev proxy). */
export const supabaseIsSameOrigin = Boolean(rawUrl?.startsWith('/'))

// A path like "/supabase" means "via the dev server's proxy", so phones on the network work too.
const url = rawUrl && supabaseIsSameOrigin ? `${window.location.origin}${rawUrl.replace(/\/$/, '')}` : rawUrl

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.')
}

export const supabase = createClient<Database>(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'tabside-auth' },
  realtime: { params: { eventsPerSecond: 20 } },
})

export type Supabase = typeof supabase
