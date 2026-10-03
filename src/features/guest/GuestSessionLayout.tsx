import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Receipt, UtensilsCrossed } from 'lucide-react'
import { useMemo } from 'react'
import { NavLink, Outlet, useParams } from 'react-router'
import { ButtonLink } from '@/components/ui/Button'
import { TableBadge, Monogram } from '@/components/ui/Display'
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback'
import { useCart } from '@/hooks/useCart'
import { useRealtimeInvalidate } from '@/hooks/useRealtime'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/cn'
import { getMenu } from '@/services/menu'
import { getSessionContext, listSessionOrders } from '@/services/sessions'
import { guestKeys, type GuestOutletContext } from './guestContext'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

export default function GuestSessionLayout() {
  const { sessionId = '' } = useParams()
  const toast = useToast()

  const ctxQuery = useQuery({ queryKey: guestKeys.context(sessionId), queryFn: () => getSessionContext(sessionId) })
  const ctx = ctxQuery.data
  const restaurantId = ctx?.restaurant.id

  const menuQuery = useQuery({ queryKey: guestKeys.menu(restaurantId ?? ''), queryFn: () => getMenu(restaurantId!), enabled: Boolean(restaurantId) })
  const ordersQuery = useQuery({ queryKey: guestKeys.orders(sessionId), queryFn: () => listSessionOrders(sessionId), enabled: Boolean(ctx) })
  const cart = useCart(sessionId, menuQuery.data)

  const subscriptions = useMemo(
    () =>
      restaurantId
        ? [
            { table: 'orders' as const, filter: `session_id=eq.${sessionId}` },
            { table: 'order_items' as const, filter: `session_id=eq.${sessionId}` },
            { table: 'table_sessions' as const, filter: `id=eq.${sessionId}` },
            { table: 'session_guests' as const, filter: `session_id=eq.${sessionId}` },
            { table: 'payments' as const, filter: `session_id=eq.${sessionId}` },
            { table: 'table_requests' as const, filter: `session_id=eq.${sessionId}` },
            { table: 'notifications' as const, filter: `session_id=eq.${sessionId}` },
            { table: 'menu_items' as const, filter: `restaurant_id=eq.${restaurantId}` },
          ]
        : [],
    [sessionId, restaurantId],
  )

  useRealtimeInvalidate(
    restaurantId ? `guest:${sessionId}` : null,
    subscriptions,
    [guestKeys.context(sessionId), guestKeys.orders(sessionId), guestKeys.bill(sessionId), guestKeys.requests(sessionId), guestKeys.menu(restaurantId ?? '')],
    (table, payload) => {
      if (table === 'notifications' && payload.eventType === 'INSERT' && payload.new.audience === 'session') {
        const type = String(payload.new.type)
        if (type === 'session.paid') return // the bill page shows its own confirmation
        toast.toast(String(payload.new.title), {
          tone: type === 'order.cancelled' || type === 'item.voided' ? 'error' : type === 'order.ready' ? 'success' : 'info',
          body: payload.new.body ? String(payload.new.body) : undefined,
        })
      }
      if (table === 'menu_items' && payload.eventType === 'UPDATE' && payload.new.availability !== 'available' && payload.old.availability !== payload.new.availability) {
        if (cart.lines.some((l) => l.itemId === payload.new.id)) {
          toast.error(`${String(payload.new.name)} is currently unavailable`, 'We’ve flagged it in your order.')
        }
      }
    },
  )

  if (ctxQuery.isPending) return <PageLoader label="Opening your tab" />
  if (ctxQuery.isError) return <ErrorState error={ctxQuery.error} onRetry={() => void ctxQuery.refetch()} className="pt-24" />
  if (!ctx) {
    return (
      <main className="mx-auto max-w-md pt-20">
        <EmptyState
          icon={<Receipt />}
          title="This tab isn’t open on this phone"
          body="Scan the QR code on your table to join it. Tabs are private to the people sitting at the table."
          action={<ButtonLink to="/">Go to TABSide</ButtonLink>}
        />
      </main>
    )
  }

  const closed = ctx.session.status === 'closed'
  const restaurantOpen = ctx.restaurant.status === 'active'
  const orderBlockedReason = closed
    ? 'This tab has been closed.'
    : !restaurantOpen
      ? `${ctx.restaurant.name} isn’t taking orders right now.`
      : !ctx.restaurant.ordering_enabled
        ? 'Ordering from the table is paused — a member of staff can take your order.'
        : null

  const activeOrders = (ordersQuery.data ?? []).filter((o) => !['delivered', 'cancelled'].includes(o.status)).length

  const outlet: GuestOutletContext = {
    sessionId,
    ctx,
    menu: menuQuery.data,
    menuLoading: menuQuery.isPending,
    menuError: menuQuery.error,
    cart,
    canOrder: orderBlockedReason === null,
    orderBlockedReason,
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/90 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-4">
          <Monogram name={ctx.restaurant.name} src={ctx.restaurant.logo_url} className="size-9 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-tight">{ctx.restaurant.name}</p>
            <p className="text-[12.5px] text-ink-2">
              {ctx.session.guest_count > 1 ? `${ctx.session.guest_count} phones on this tab` : 'Your table’s tab'}
              {ctx.me && ctx.session.guest_count > 1 ? `, you’re guest ${ctx.me.guest_number}` : ''}
            </p>
          </div>
          <ThemeToggle compact />
          <TableBadge label={ctx.table.label} />
        </div>
        {closed && (
          <div className="flex items-center justify-between gap-3 bg-surface-2 px-4 py-2.5 text-sm">
            <span>This tab is closed. Thanks for visiting!</span>
            <ButtonLink to={`/r/${ctx.restaurant.slug}/table/${ctx.table.id}`} size="sm" variant="secondary">Start a new tab</ButtonLink>
          </div>
        )}
      </header>

      <main className="flex-1 pb-[calc(76px+env(safe-area-inset-bottom))]">
        <Outlet context={outlet} />
      </main>

      <nav aria-label="Your table" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md">
        <div className="mx-auto grid h-[68px] max-w-xl grid-cols-3">
          <GuestTab to={`/session/${sessionId}`} end icon={<UtensilsCrossed />} label="Menu" />
          <GuestTab to={`/session/${sessionId}/orders`} icon={<ClipboardList />} label="Orders" badge={activeOrders || undefined} />
          <GuestTab to={`/session/${sessionId}/bill`} icon={<Receipt />} label="Bill" dot={ctx.session.status === 'paid'} />
        </div>
      </nav>
    </div>
  )
}

function GuestTab({ to, icon, label, end, badge, dot }: { to: string; icon: React.ReactNode; label: string; end?: boolean; badge?: number; dot?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn('relative flex flex-col items-center justify-center gap-1 text-[12px] font-semibold transition-colors [&_svg]:size-[22px]', isActive ? 'text-clay' : 'text-ink-2')
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            {icon}
            {badge !== undefined && (
              <span className="tnum absolute -top-1.5 -right-2.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-clay px-1 text-[11px] font-bold text-on-clay">
                {badge}
              </span>
            )}
            {dot && <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-sage ring-2 ring-surface" />}
          </span>
          {label}
          {isActive && <span aria-hidden className="absolute top-0 h-[3px] w-10 rounded-b-full bg-clay" />}
        </>
      )}
    </NavLink>
  )
}
