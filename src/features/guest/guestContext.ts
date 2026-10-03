import { useOutletContext } from 'react-router'
import type { useCart } from '@/hooks/useCart'
import type { Menu } from '@/services/menu'
import type { SessionContext } from '@/services/sessions'

export interface GuestOutletContext {
  sessionId: string
  ctx: SessionContext
  menu: Menu | undefined
  menuLoading: boolean
  menuError: unknown
  cart: ReturnType<typeof useCart>
  canOrder: boolean
  orderBlockedReason: string | null
}

export function useGuest(): GuestOutletContext {
  return useOutletContext<GuestOutletContext>()
}

export const guestKeys = {
  context: (sessionId: string) => ['guest', 'context', sessionId] as const,
  orders: (sessionId: string) => ['guest', 'orders', sessionId] as const,
  bill: (sessionId: string) => ['guest', 'bill', sessionId] as const,
  requests: (sessionId: string) => ['guest', 'requests', sessionId] as const,
  menu: (restaurantId: string) => ['menu', restaurantId] as const,
}

// Remember which tab this phone joined at each table, so a re-scan can offer "Return to your tab".
const TABS_KEY = 'tabside-tabs'

export function rememberTab(tableId: string, sessionId: string) {
  try {
    const map = JSON.parse(localStorage.getItem(TABS_KEY) ?? '{}') as Record<string, string>
    map[tableId] = sessionId
    localStorage.setItem(TABS_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function rememberedTab(tableId: string): string | null {
  try {
    return (JSON.parse(localStorage.getItem(TABS_KEY) ?? '{}') as Record<string, string>)[tableId] ?? null
  } catch {
    return null
  }
}
