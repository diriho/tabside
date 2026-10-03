import { api, unwrap } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type {
  Analytics, AvailabilityReport, BoardTable, Dashboard, Notification, OrderStatus, OrderWithItems, Payment, PaymentMethod,
  RestaurantTable, Review, StaffMember, StaffRole, TableRequest,
} from '@/types/domain'

// ─── Orders & tables (staff) ──────────────────────────────────────────────────

export interface KitchenOrder extends OrderWithItems {
  restaurant_tables: { label: string } | null
  table_sessions: { party_size: number; guest_count: number } | null
  session_guests: { guest_number: number; display_name: string | null } | null
}

const KITCHEN_SELECT =
  '*, order_items(*), restaurant_tables(label), table_sessions(party_size, guest_count), session_guests(guest_number, display_name)'

export async function listActiveOrders(restaurantId: string): Promise<KitchenOrder[]> {
  return unwrap(
    await supabase
      .from('orders')
      .select(KITCHEN_SELECT)
      .eq('restaurant_id', restaurantId)
      .in('status', ['pending', 'accepted', 'preparing', 'ready'])
      .order('placed_at', { ascending: true }),
  ) as unknown as KitchenOrder[]
}

export async function listRecentOrders(restaurantId: string, opts: { status?: OrderStatus | 'all'; limit?: number } = {}): Promise<KitchenOrder[]> {
  let q = supabase.from('orders').select(KITCHEN_SELECT).eq('restaurant_id', restaurantId)
  if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status)
  return unwrap(await q.order('placed_at', { ascending: false }).limit(opts.limit ?? 60)) as unknown as KitchenOrder[]
}

export async function setOrderStatus(orderId: string, status: OrderStatus, reason?: string) {
  return unwrap(await supabase.rpc('set_order_status', { p_order_id: orderId, p_status: status, p_reason: reason }))
}

export async function advanceSessionOrders(sessionId: string, from: OrderStatus, to: OrderStatus): Promise<number> {
  return unwrap(await supabase.rpc('advance_session_orders', { p_session_id: sessionId, p_from: from, p_to: to }))
}

export async function voidOrderItem(orderItemId: string, reason: string, markSoldOut: boolean) {
  return unwrap(await supabase.rpc('void_order_item', { p_order_item_id: orderItemId, p_reason: reason, p_mark_sold_out: markSoldOut }))
}

export async function getTableBoard(restaurantId: string): Promise<BoardTable[]> {
  return unwrap(await supabase.rpc('get_table_board', { p_restaurant_id: restaurantId })) as unknown as BoardTable[]
}

export async function listSessionRequests(sessionId: string): Promise<TableRequest[]> {
  return unwrap(await supabase.from('table_requests').select('*').eq('session_id', sessionId).neq('status', 'resolved').order('created_at'))
}

export async function updateRequest(requestId: string, status: 'acknowledged' | 'resolved') {
  return unwrap(await supabase.rpc('update_request_status', { p_request_id: requestId, p_status: status }))
}

export async function recordManualPayment(sessionId: string, method: Exclude<PaymentMethod, 'stripe'>, amountMinor?: number, note?: string) {
  return unwrap(
    await supabase.rpc('record_manual_payment', { p_session_id: sessionId, p_method: method, p_amount_minor: amountMinor, p_note: note }),
  ) as unknown as Payment
}

export async function listSessionPayments(sessionId: string): Promise<Payment[]> {
  return unwrap(await supabase.from('payments').select('*').eq('session_id', sessionId).order('created_at'))
}

export async function closeSession(sessionId: string, force = false) {
  unwrap(await supabase.rpc('close_session', { p_session_id: sessionId, p_force: force }))
}

// ─── Tables (manager) ─────────────────────────────────────────────────────────

export async function listTables(restaurantId: string): Promise<RestaurantTable[]> {
  return unwrap(
    await supabase.from('restaurant_tables').select('*').eq('restaurant_id', restaurantId).is('archived_at', null).order('sort_order').order('label'),
  )
}

export async function saveTable(input: { id?: string; restaurant_id: string; label: string; capacity: number; is_active: boolean; sort_order?: number }) {
  const { id, ...rest } = input
  if (id) return unwrap(await supabase.from('restaurant_tables').update(rest).eq('id', id).select('*').single())
  return unwrap(await supabase.from('restaurant_tables').insert(rest).select('*').single())
}

export async function archiveTable(id: string) {
  unwrap(await supabase.from('restaurant_tables').update({ archived_at: new Date().toISOString(), is_active: false }).eq('id', id))
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export async function listStaff(restaurantId: string): Promise<StaffMember[]> {
  return unwrap(await supabase.from('staff_members').select('*').eq('restaurant_id', restaurantId).order('is_active', { ascending: false }).order('role').order('display_name'))
}

export async function createStaff(input: { restaurantId: string; email: string; displayName: string; role: StaffRole; password: string }) {
  return api<{ staffId: string; created: boolean }>('/api/staff', input)
}

export async function updateStaff(id: string, patch: { role?: StaffRole; display_name?: string; is_active?: boolean }) {
  return unwrap(await supabase.from('staff_members').update(patch).eq('id', id).select('*').single())
}

// ─── Reviews (manager) ────────────────────────────────────────────────────────

export async function listAllReviews(restaurantId: string): Promise<Review[]> {
  return unwrap(await supabase.from('reviews').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(200))
}

export async function moderateReview(id: string, isHidden: boolean, isFeatured: boolean) {
  return unwrap(await supabase.rpc('moderate_review', { p_review_id: id, p_is_hidden: isHidden, p_is_featured: isFeatured }))
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export async function getDashboard(restaurantId: string): Promise<Dashboard> {
  return unwrap(await supabase.rpc('get_dashboard', { p_restaurant_id: restaurantId })) as unknown as Dashboard
}

export async function getAnalytics(restaurantId: string, days: number): Promise<Analytics> {
  return unwrap(await supabase.rpc('get_analytics', { p_restaurant_id: restaurantId, p_days: days })) as unknown as Analytics
}

export async function listAvailabilityReports(restaurantId: string): Promise<Array<AvailabilityReport & { menu_items: { name: string } | null }>> {
  return unwrap(
    await supabase.from('availability_reports').select('*, menu_items(name)').eq('restaurant_id', restaurantId).eq('status', 'open').order('created_at', { ascending: false }),
  ) as unknown as Array<AvailabilityReport & { menu_items: { name: string } | null }>
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function listStaffNotifications(restaurantId: string): Promise<Array<Notification & { read: boolean }>> {
  const { data: auth } = await supabase.auth.getSession()
  const uid = auth.session?.user.id
  const [notes, reads] = await Promise.all([
    supabase.from('notifications').select('*').eq('restaurant_id', restaurantId).eq('audience', 'staff').order('created_at', { ascending: false }).limit(40),
    supabase.from('notification_reads').select('notification_id').eq('user_id', uid ?? ''),
  ])
  const readIds = new Set(unwrap(reads).map((r) => r.notification_id))
  return unwrap(notes).map((n) => ({ ...n, read: readIds.has(n.id) }))
}

export async function listSessionNotifications(sessionId: string): Promise<Notification[]> {
  return unwrap(await supabase.from('notifications').select('*').eq('session_id', sessionId).eq('audience', 'session').order('created_at', { ascending: false }).limit(30))
}

export async function markNotificationsRead(ids: string[]) {
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid || ids.length === 0) return
  await supabase.from('notification_reads').upsert(ids.map((notification_id) => ({ notification_id, user_id: uid })), { ignoreDuplicates: true })
}
