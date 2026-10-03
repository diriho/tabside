import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type RealtimeTable =
  | 'orders' | 'order_items' | 'table_sessions' | 'session_guests' | 'table_requests' | 'payments'
  | 'menu_items' | 'notifications' | 'availability_reports' | 'restaurant_tables' | 'reviews'

export interface RealtimeSubscription {
  table: RealtimeTable
  /** Postgres-changes filter, e.g. `restaurant_id=eq.<uuid>` */
  filter?: string
}

export type RealtimeStatus = 'connecting' | 'live' | 'offline'

/**
 * Realtime as an invalidation signal: any change on the subscribed tables refetches the given
 * query keys from the database (debounced), so the UI always shows authoritative data.
 * RLS applies to every event, so subscribers only ever hear about rows they may read.
 */
export function useRealtimeInvalidate(
  channelName: string | null,
  subscriptions: RealtimeSubscription[],
  queryKeys: QueryKey[],
  onEvent?: (table: RealtimeTable, payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => void,
): RealtimeStatus {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<RealtimeStatus>('connecting')
  const keysRef = useRef(queryKeys)
  const onEventRef = useRef(onEvent)
  keysRef.current = queryKeys
  onEventRef.current = onEvent
  const subsKey = JSON.stringify(subscriptions)

  useEffect(() => {
    if (!channelName) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const invalidate = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        for (const key of keysRef.current) void queryClient.invalidateQueries({ queryKey: key })
      }, 120)
    }

    const subs = JSON.parse(subsKey) as RealtimeSubscription[]
    let channel = supabase.channel(`${channelName}:${crypto.randomUUID().slice(0, 8)}`)
    for (const sub of subs) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: sub.table, ...(sub.filter ? { filter: sub.filter } : {}) },
        (payload) => {
          onEventRef.current?.(sub.table, payload as never)
          invalidate()
        },
      )
    }

    // Catch-up refetches after every (re)subscribe. Supabase Realtime reports SUBSCRIBED before its
    // replication stream is necessarily running (it starts lazily after an idle period), so changes
    // in the first few seconds can be dropped. Two one-off refetches close that window — not polling.
    const catchUps: Array<ReturnType<typeof setTimeout>> = []
    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        setStatus('live')
        invalidate()
        catchUps.push(setTimeout(invalidate, 4_000), setTimeout(invalidate, 10_000))
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
        setStatus('offline')
      }
    })

    // Realtime connections carry the JWT; keep it fresh after token refreshes.
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token)
    })

    return () => {
      clearTimeout(timer)
      catchUps.forEach(clearTimeout)
      authSub.subscription.unsubscribe()
      void supabase.removeChannel(channel)
    }
  }, [channelName, subsKey, queryClient])

  return status
}
