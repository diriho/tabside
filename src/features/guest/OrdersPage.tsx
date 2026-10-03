import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Plus } from 'lucide-react'
import { useLocation } from 'react-router'
import { GuestOrderCard } from '@/components/orders/OrderTicket'
import { ButtonLink } from '@/components/ui/Button'
import { Money } from '@/components/ui/Display'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { listSessionOrders } from '@/services/sessions'
import { guestKeys, useGuest } from './guestContext'

export default function OrdersPage() {
  const { sessionId, ctx, canOrder } = useGuest()
  const location = useLocation()
  const highlight = (location.state as { highlight?: string } | null)?.highlight
  const orders = useQuery({ queryKey: guestKeys.orders(sessionId), queryFn: () => listSessionOrders(sessionId) })
  const currency = ctx.restaurant.currency

  if (orders.isPending) {
    return (
      <div className="space-y-4 px-4 pt-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    )
  }
  if (orders.isError) return <ErrorState error={orders.error} onRetry={() => void orders.refetch()} className="pt-16" />

  const list = [...orders.data].reverse()
  if (list.length === 0) {
    return (
      <EmptyState
        className="pt-20"
        icon={<ClipboardList />}
        title="No orders on this tab yet"
        body="When anyone at your table orders, it shows up here with live status."
        action={<ButtonLink to={`/session/${sessionId}`}>Browse the menu</ButtonLink>}
      />
    )
  }

  const total = orders.data.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total_minor, 0)
  const guestName = (guestId: string | null) => {
    if (!guestId) return 'Ordered by staff'
    if (guestId === ctx.me?.id) return 'You'
    const g = ctx.guests.find((x) => x.id === guestId)
    return g?.display_name ?? (g ? `Guest ${g.guest_number}` : 'Someone at your table')
  }

  return (
    <div className="px-4 pt-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="display text-[30px] font-extrabold">Table {ctx.table.label}’s orders</h1>
          <p className="text-[15px] text-ink-2">
            {orders.data.length} {orders.data.length === 1 ? 'round' : 'rounds'} so far, <Money minor={total} currency={currency} /> on the tab
          </p>
        </div>
      </div>

      {canOrder && (
        <ButtonLink to={`/session/${sessionId}`} variant="secondary" size="lg" block className="mt-5" icon={<Plus className="size-5" />}>
          Order more
        </ButtonLink>
      )}

      <div className="mt-5 space-y-4 pb-6">
        {list.map((order) => (
          <GuestOrderCard
            key={order.id}
            order={order}
            currency={currency}
            whoLabel={guestName(order.guest_id)}
            timeZone={ctx.restaurant.timezone}
            highlight={order.id === highlight}
          />
        ))}
      </div>
    </div>
  )
}
