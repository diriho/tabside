import type { Database, Tables } from './database'

export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]

export type Restaurant = Tables<'restaurants'>
export type RestaurantTable = Tables<'restaurant_tables'>
export type TableSession = Tables<'table_sessions'>
export type SessionGuest = Tables<'session_guests'>
export type MenuCategory = Tables<'menu_categories'>
export type MenuItem = Tables<'menu_items'>
export type MenuVariant = Tables<'menu_item_variants'>
export type ModifierGroup = Tables<'menu_modifier_groups'>
export type Modifier = Tables<'menu_modifiers'>
export type Tax = Tables<'taxes'>
export type Order = Tables<'orders'>
export type OrderItem = Tables<'order_items'>
export type OrderTax = Tables<'order_taxes'>
export type TableRequest = Tables<'table_requests'>
export type Payment = Tables<'payments'>
export type Review = Tables<'reviews'>
export type StaffMember = Tables<'staff_members'>
export type Notification = Tables<'notifications'>
export type AvailabilityReport = Tables<'availability_reports'>

export type StaffRole = Enums<'staff_role'>
export type OrderStatus = Enums<'order_status'>
export type SessionStatus = Enums<'session_status'>
export type PaymentMethod = Enums<'payment_method'>
export type ItemAvailability = Enums<'item_availability'>

export interface OrderModifierSnapshot {
  id: string
  group: string
  name: string
  price_delta_minor: number
}

export interface TableEntry {
  table: { id: string; label: string; capacity: number; is_active: boolean }
  restaurant: {
    id: string
    slug: string
    name: string
    tagline: string | null
    logo_url: string | null
    hero_image_url: string | null
    currency: string
    status: 'active' | 'closed'
    ordering_enabled: boolean
    rating_count: number
    rating_avg: number | null
  }
  active_session: { party_size: number; guest_count: number; status: SessionStatus; opened_at: string } | null
}

export interface JoinResult {
  session_id: string
  guest_id: string
  guest_number: number
  is_new_session: boolean
  party_size: number
  guest_count: number
  table_label: string
  restaurant_slug: string
}

export interface BillTax {
  name: string
  rate_bps: number
  is_inclusive: boolean
  amount_minor: number
}

export interface Bill {
  session_id: string
  status: SessionStatus
  currency: string
  order_count: number
  subtotal_minor: number
  inclusive_tax_minor: number
  exclusive_tax_minor: number
  total_minor: number
  paid_minor: number
  due_minor: number
  taxes: BillTax[]
  pending_online_payment: boolean
}

export interface QuoteLine {
  menu_item_id: string
  variant_id: string | null
  name: string
  variant_name: string | null
  unit_price_minor: number
  quantity: number
  line_total_minor: number
}

export interface Quote {
  currency: string
  subtotal_minor: number
  item_count: number
  inclusive_tax_minor: number
  exclusive_tax_minor: number
  total_minor: number
  taxes: BillTax[]
  lines: QuoteLine[]
}

export type TableState = 'idle' | 'active' | 'new_order' | 'preparing' | 'ready' | 'bill_requested' | 'paid'

export interface BoardTable {
  table_id: string
  label: string
  capacity: number
  sort_order: number
  is_active: boolean
  session_id: string | null
  session_status: SessionStatus | null
  party_size: number | null
  guest_count: number | null
  opened_at: string | null
  pending: number
  in_progress: number
  ready: number
  delivered: number
  total_minor: number
  paid_minor: number
  due_minor: number
  bill_requested: boolean
  waiter_called: boolean
  preferred_method: PaymentMethod | null
  state: TableState
}

export interface Dashboard {
  currency: string
  revenue_today_minor: number
  sales_today_minor: number
  orders_today: number
  avg_order_minor: number | null
  paid_orders_today: number
  pending_payments_minor: number
  tabs_with_balance: number
  active_tables: number
  total_tables: number
  guests_seated: number
  orders_pending: number
  orders_accepted: number
  orders_preparing: number
  orders_ready: number
  orders_completed_today: number
  open_bill_requests: number
  open_availability_reports: number
  rating_avg: number | null
  rating_count: number
}

export interface Analytics {
  currency: string
  days: number
  totals: { orders: number; sales_minor: number; avg_order_minor: number | null; revenue_minor: number }
  by_day: Array<{ day: string; orders: number; sales_minor: number; revenue_minor: number; avg_order_minor: number }>
  by_hour: Array<{ hour: number; orders: number }>
  popular_items: Array<{ name: string; quantity: number; sales_minor: number }>
}

/** Order with its lines, as rendered on guest status screens and kitchen tickets. */
export interface OrderWithItems extends Order {
  order_items: OrderItem[]
}
