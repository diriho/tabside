import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ellipsis, Users } from 'lucide-react'
import { useState } from 'react'
import { OrderLines } from '@/components/orders/OrderTicket'
import { Button } from '@/components/ui/Button'
import { StatusPill, TableNumeral } from '@/components/ui/Display'
import { InlineAlert } from '@/components/ui/Feedback'
import { Field, Input, Switch } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { elapsed, formatTime, minutesSince } from '@/lib/time'
import { setOrderStatus, voidOrderItem, type KitchenOrder } from '@/services/operations'
import type { OrderStatus, StaffRole } from '@/types/domain'
import { staffKeys } from './staffKeys'

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string; variant: 'primary' | 'sage' | 'secondary' }>> = {
  pending: { to: 'accepted', label: 'Accept', variant: 'primary' },
  accepted: { to: 'preparing', label: 'Start preparing', variant: 'primary' },
  preparing: { to: 'ready', label: 'Mark ready', variant: 'sage' },
  ready: { to: 'delivered', label: 'Delivered', variant: 'secondary' },
}

export function KitchenTicket({
  order,
  restaurantId,
  role,
  now,
  currency,
  timeZone,
}: {
  order: KitchenOrder
  restaurantId: string
  role: StaffRole
  now: number
  currency: string
  timeZone: string
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const next = NEXT[order.status]
  const waited = minutesSince(order.placed_at, now)
  const late = order.status !== 'ready' && waited >= 20
  const slow = order.status !== 'ready' && waited >= 10

  const advance = useMutation({
    mutationFn: (to: OrderStatus) => setOrderStatus(order.id, to),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: staffKeys.all(restaurantId) }),
    onError: (err) => toast.error('Couldn’t update the order', errorMessage(err)),
  })

  const label = order.restaurant_tables?.label ?? '?'
  const party = order.table_sessions?.party_size
  const guest = order.session_guests ? order.session_guests.display_name ?? `Guest ${order.session_guests.guest_number}` : null

  return (
    <article
      aria-label={`Order ${order.order_number}, table ${label}`}
      className={cn(
        'paper flex flex-col overflow-hidden rounded-lg border shadow-soft',
        order.status === 'pending' ? 'border-brass ring-2 ring-brass/30' : 'border-line',
      )}
    >
      <header className="flex items-start gap-3 border-b border-dashed border-line-strong bg-surface/80 px-4 pt-3 pb-3">
        <div className="flex min-w-14 flex-col items-center">
          <TableNumeral label={label} size={label.length > 3 ? 'sm' : 'md'} tone="ink" />
          <span className="text-[11px] font-semibold text-ink-3">Table</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[17px] font-bold">#{order.order_number}</span>
            <StatusPill status={order.status} />
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13.5px] text-ink-2">
            {party !== undefined && <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{party}</span>}
            <span>Round {order.session_seq}</span>
            {guest && <span>{guest}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className={cn('tnum text-[15px] font-bold', late ? 'text-danger' : slow ? 'text-brass-ink' : 'text-ink')}>{elapsed(order.placed_at, now)}</p>
          <p className="tnum text-[12px] text-ink-3">{formatTime(order.placed_at, timeZone)}</p>
        </div>
      </header>

      <div className="flex-1 px-4 py-3">
        <OrderLines order={order} currency={currency} showPrices={false} large />
        {order.notes && <InlineAlert tone="warning" className="mt-3 font-semibold">“{order.notes}”</InlineAlert>}
      </div>

      <footer className="flex gap-2 border-t border-line bg-surface/80 p-3">
        {next && (role !== 'kitchen' || order.status !== 'ready') ? (
          <Button
            variant={next.variant}
            size="lg"
            block
            loading={advance.isPending}
            onClick={() => advance.mutate(next.to)}
          >
            {next.label}
          </Button>
        ) : (
          <p className="flex flex-1 items-center text-sm font-semibold text-ink-2">Waiting for a server</p>
        )}
        {order.status === 'pending' && (
          <Button variant="secondary" size="lg" onClick={() => advance.mutate('preparing')} disabled={advance.isPending}>
            Start now
          </Button>
        )}
        <Button variant="secondary" size="lg" aria-label={`More actions for order ${order.order_number}`} onClick={() => setMenuOpen(true)} className="px-3">
          <Ellipsis className="size-5" />
        </Button>
      </footer>

      <TicketActions order={order} restaurantId={restaurantId} role={role} open={menuOpen} onClose={() => setMenuOpen(false)} />
    </article>
  )
}

function TicketActions({ order, restaurantId, role, open, onClose }: { order: KitchenOrder; restaurantId: string; role: StaffRole; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [markSoldOut, setMarkSoldOut] = useState(true)
  const [cancelReason, setCancelReason] = useState('')
  const lines = order.order_items.filter((l) => !l.is_voided)

  const voidLine = useMutation({
    mutationFn: (lineId: string) => voidOrderItem(lineId, reason.trim() || 'Unavailable', markSoldOut),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: staffKeys.all(restaurantId) })
      void queryClient.invalidateQueries({ queryKey: staffKeys.menu(restaurantId) })
      toast.success('Item removed', 'The guest has been told and won’t be charged.')
    },
    onError: (err) => toast.error('Couldn’t remove the item', errorMessage(err)),
  })
  const cancel = useMutation({
    mutationFn: () => setOrderStatus(order.id, 'cancelled', cancelReason.trim() || undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: staffKeys.all(restaurantId) })
      toast.success(`Order #${order.order_number} cancelled`)
      onClose()
    },
    onError: (err) => toast.error('Couldn’t cancel', errorMessage(err)),
  })

  return (
    <Sheet open={open} onClose={onClose} title={`Order #${order.order_number}`} description={`Table ${order.restaurant_tables?.label ?? ''}, round ${order.session_seq}`}>
      <section>
        <h3 className="font-bold">Something ran out?</h3>
        <p className="text-sm text-ink-2">Remove the line from this order. The guest is notified and not charged.</p>
        <div className="mt-3 space-y-3">
          <Field label="Reason" optional>{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Out of buns" />}</Field>
          <Switch checked={markSoldOut} onChange={setMarkSoldOut} label="Also mark it sold out" description="Stops new orders and alerts the manager." />
        </div>
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="font-semibold">{l.quantity}× {l.name}{l.variant_name ? ` (${l.variant_name})` : ''}</span>
              <Button variant="secondary" size="sm" loading={voidLine.isPending && voidLine.variables === l.id} onClick={() => voidLine.mutate(l.id)}>
                Unavailable
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {role !== 'kitchen' && order.status !== 'delivered' && (
        <section className="mt-6 border-t border-line pt-5">
          <h3 className="font-bold">Cancel the whole order</h3>
          <div className="mt-3 flex gap-2">
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason shown to the guest" aria-label="Cancellation reason" />
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel order</Button>
          </div>
        </section>
      )}
    </Sheet>
  )
}
