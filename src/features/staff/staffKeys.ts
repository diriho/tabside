import type { RealtimeSubscription } from '@/hooks/useRealtime'

export const staffKeys = {
  all: (restaurantId: string) => ['staff', restaurantId] as const,
  orders: (restaurantId: string) => ['staff', restaurantId, 'orders'] as const,
  board: (restaurantId: string) => ['staff', restaurantId, 'board'] as const,
  session: (restaurantId: string, sessionId: string) => ['staff', restaurantId, 'session', sessionId] as const,
  notifications: (restaurantId: string) => ['staff', restaurantId, 'notifications'] as const,
  menu: (restaurantId: string) => ['menu', restaurantId] as const,
  dashboard: (restaurantId: string) => ['staff', restaurantId, 'dashboard'] as const,
  reports: (restaurantId: string) => ['staff', restaurantId, 'reports'] as const,
}

export function restaurantSubscriptions(restaurantId: string): RealtimeSubscription[] {
  const filter = `restaurant_id=eq.${restaurantId}`
  return [
    { table: 'orders', filter },
    { table: 'order_items', filter },
    { table: 'table_sessions', filter },
    { table: 'session_guests', filter },
    { table: 'table_requests', filter },
    { table: 'payments', filter },
    { table: 'notifications', filter },
    { table: 'menu_items', filter },
    { table: 'availability_reports', filter },
    { table: 'restaurant_tables', filter },
    { table: 'reviews', filter },
  ]
}
