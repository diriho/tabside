import { AppError, toAppError } from './errors'
import { supabase } from './supabase'

/** Calls our Node API with the current user's JWT. */
export async function api<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  let res: Response
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    throw toAppError(err)
  }
  const payload = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
  if (!res.ok) {
    const mapped = toAppError({ error: payload.error ?? 'unknown' })
    throw mapped.code === 'unknown' ? new AppError(payload.error ?? 'unknown', payload.message) : mapped
  }
  return payload as T
}

/** Unwraps a Supabase result, converting errors into AppError. Use for queries that always return data. */
export function unwrap<R extends { data: unknown; error: unknown }>(result: R): NonNullable<R['data']> {
  if (result.error) throw toAppError(result.error)
  return result.data as NonNullable<R['data']>
}

/** Like unwrap, but `null` is a legitimate answer (e.g. `.maybeSingle()`). */
export function unwrapMaybe<R extends { data: unknown; error: unknown }>(result: R): R['data'] {
  if (result.error) throw toAppError(result.error)
  return result.data
}
