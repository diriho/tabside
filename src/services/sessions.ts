import { api, unwrap, unwrapMaybe } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type {
  Bill, JoinResult, OrderStatus, OrderWithItems, PaymentMethod, Quote, SessionGuest, TableRequest, TableSession,
} from '@/types/domain'
import type { CartLine } from '@/hooks/useCart'

/** Guests are Supabase anonymous users: created silently the first time they join a table. */
export async function ensureGuestIdentity(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (data.session?.user) return data.session.user.id
  const res = unwrap(await supabase.auth.signInAnonymously())
  if (!res.user) throw new Error('not_authenticated')
  return res.user.id
}

export async function joinTable(tableId: string, partySize?: number): Promise<JoinResult> {
  await ensureGuestIdentity()
  return unwrap(await supabase.rpc('join_table', { p_table_id: tableId, p_party_size: partySize })) as unknown as JoinResult
}

export interface SessionContext {
  session: TableSession
  table: { id: string; label: string; capacity: number }
  restaurant: { id: string; slug: string; name: string; currency: string; logo_url: string | null; status: string; ordering_enabled: boolean; timezone: string }
  guests: SessionGuest[]
  me: SessionGuest | null
}

export async function getSessionContext(sessionId: string): Promise<SessionContext | null> {
  const { data: auth } = await supabase.auth.getSession()
  const uid = auth.session?.user.id
  const session = unwrapMaybe(await supabase.from('table_sessions').select('*').eq('id', sessionId).maybeSingle())
  if (!session) return null
  const [table, restaurant, guests] = await Promise.all([
    supabase.from('restaurant_tables').select('id, label, capacity').eq('id', session.table_id).single(),
    supabase.from('restaurants').select('id, slug, name, currency, logo_url, status, ordering_enabled, timezone').eq('id', session.restaurant_id).single(),
    supabase.from('session_guests').select('*').eq('session_id', sessionId).order('guest_number'),
  ])
  const guestList = unwrap(guests)
  return {
    session,
    table: unwrap(table),
    restaurant: unwrap(restaurant),
    guests: guestList,
    me: guestList.find((g) => g.user_id === uid) ?? null,
  }
}

export async function listSessionOrders(sessionId: string): Promise<OrderWithItems[]> {
  return unwrap(
    await supabase.from('orders').select('*, order_items(*)').eq('session_id', sessionId).order('session_seq', { ascending: true }),
  ) as OrderWithItems[]
}

export function cartToItems(lines: CartLine[]) {
  return lines.map((l) => ({
    menu_item_id: l.itemId,
    variant_id: l.variantId ?? undefined,
    modifier_ids: l.modifierIds,
    quantity: l.quantity,
    notes: l.notes || undefined,
  }))
}

export async function quoteOrder(sessionId: string, lines: CartLine[]): Promise<Quote> {
  return unwrap(await supabase.rpc('quote_order', { p_session_id: sessionId, p_items: cartToItems(lines) })) as unknown as Quote
}

export async function placeOrder(sessionId: string, lines: CartLine[], notes?: string) {
  return unwrap(
    await supabase.rpc('place_order', { p_session_id: sessionId, p_items: cartToItems(lines), p_notes: notes || undefined }),
  ) as unknown as OrderWithItems
}

export async function getBill(sessionId: string): Promise<Bill> {
  return unwrap(await supabase.rpc('session_bill', { p_session_id: sessionId })) as unknown as Bill
}

export async function requestAssistance(sessionId: string, type: 'bill' | 'waiter', preferredMethod?: PaymentMethod, note?: string) {
  return unwrap(
    await supabase.rpc('request_assistance', { p_session_id: sessionId, p_type: type, p_preferred_method: preferredMethod, p_note: note }),
  ) as unknown as TableRequest
}

export async function listOpenRequests(sessionId: string): Promise<TableRequest[]> {
  return unwrap(await supabase.from('table_requests').select('*').eq('session_id', sessionId).neq('status', 'resolved'))
}

export async function startCheckout(sessionId: string): Promise<{ url: string; paymentId: string }> {
  return api('/api/payments/checkout', { sessionId })
}

export async function syncPayment(paymentId: string): Promise<{ outcome: string }> {
  return api('/api/payments/sync', { paymentId })
}

export async function getPaymentsConfig(): Promise<{ onlinePayments: boolean }> {
  try {
    return await api('/api/config')
  } catch {
    return { onlinePayments: false }
  }
}

export async function submitReview(sessionId: string, rating: number, body?: string, guestName?: string) {
  return unwrap(await supabase.rpc('submit_review', { p_session_id: sessionId, p_rating: rating, p_body: body, p_guest_name: guestName }))
}

export async function getMyReview(sessionId: string) {
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) return null
  return unwrapMaybe(await supabase.from('reviews').select('*').eq('session_id', sessionId).eq('user_id', uid).maybeSingle())
}

export const ORDER_FLOW: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'delivered']
