import { Check } from 'lucide-react'
import { Money, StatusPill } from '@/components/ui/Display'
import { cn } from '@/lib/cn'
import { formatTime } from '@/lib/time'
import type { OrderModifierSnapshot, OrderStatus, OrderWithItems } from '@/types/domain'

const STEPS: Array<{ status: OrderStatus; label: string }> = [
  { status: 'pending', label: 'Sent' },
  { status: 'accepted', label: 'Accepted' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready', label: 'Ready' },
  { status: 'delivered', label: 'Delivered' },
]

/** Five-step progress for guests: done ✓, current (pulsing), upcoming ○. */
export function StatusTrack({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') return null
  const current = STEPS.findIndex((s) => s.status === status)
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label={`Status: ${STEPS[current]?.label}`}>
      {STEPS.map((step, i) => {
        const done = i < current || status === 'delivered'
        const now = i === current && status !== 'delivered'
        return (
          <li key={step.status} className="flex flex-col items-center gap-1.5" aria-current={now ? 'step' : undefined}>
            <span className="relative flex h-6 w-full items-center">
              {i > 0 && <span className={cn('absolute right-1/2 left-[-50%] h-[3px] rounded-full', i <= current ? 'bg-clay' : 'bg-line')} />}
              <span
                className={cn(
                  'relative z-10 mx-auto flex size-6 items-center justify-center rounded-full border-2 transition-colors',
                  done && 'border-clay bg-clay text-on-clay',
                  now && 'animate-pulse-ring border-clay bg-surface',
                  !done && !now && 'border-line-strong bg-surface',
                )}
              >
                {done && <Check className="size-3.5" strokeWidth={3} />}
                {now && <span className="size-2 rounded-full bg-clay" />}
              </span>
            </span>
            <span className={cn('text-center text-[11.5px] leading-tight font-semibold', now ? 'text-clay' : done ? 'text-ink' : 'text-ink-3')}>
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function OrderLines({ order, currency, showPrices = true, large }: { order: OrderWithItems; currency: string; showPrices?: boolean; large?: boolean }) {
  const items = [...order.order_items].sort((a, b) => a.position - b.position)
  return (
    <ul className={cn('space-y-2', large && 'space-y-3')}>
      {items.map((line) => {
        const mods = (line.modifiers as unknown as OrderModifierSnapshot[]).map((m) => m.name)
        const detail = [line.variant_name, ...mods].filter(Boolean).join(', ')
        return (
          <li key={line.id} className={cn('flex gap-3', line.is_voided && 'opacity-60')}>
            <span className={cn('tnum shrink-0 font-bold', large ? 'w-10 text-xl' : 'w-7')}>{line.quantity}×</span>
            <div className="min-w-0 flex-1">
              <p className={cn('font-semibold leading-snug', large && 'text-lg', line.is_voided && 'line-through')}>{line.name}</p>
              {detail && <p className={cn('text-ink-2', large ? 'text-[15px]' : 'text-sm')}>{detail}</p>}
              {line.notes && <p className={cn('font-medium text-clay', large ? 'text-[15px]' : 'text-sm')}>“{line.notes}”</p>}
              {line.is_voided && <p className="text-sm font-semibold text-danger">Removed: {line.void_reason}</p>}
            </div>
            {showPrices && !line.is_voided && <Money minor={line.line_total_minor} currency={currency} className="shrink-0 text-[15px]" />}
          </li>
        )
      })}
    </ul>
  )
}

/** Guest-facing order card on the shared tab. */
export function GuestOrderCard({
  order,
  currency,
  whoLabel,
  timeZone,
  highlight,
}: {
  order: OrderWithItems
  currency: string
  whoLabel: string
  timeZone?: string
  highlight?: boolean
}) {
  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border bg-surface shadow-soft transition-shadow',
        highlight ? 'border-clay ring-3 ring-clay/15' : 'border-line',
        order.status === 'cancelled' && 'opacity-75',
      )}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <div>
          <h3 className="font-bold">
            Round {order.session_seq} <span className="font-medium text-ink-3">#{order.order_number}</span>
          </h3>
          <p className="text-[13px] text-ink-2">{whoLabel}, {formatTime(order.placed_at, timeZone)}</p>
        </div>
        <StatusPill status={order.status} guestFacing />
      </header>
      {order.status !== 'cancelled' && (
        <div className="px-4 pt-4">
          <StatusTrack status={order.status} />
        </div>
      )}
      <div className="paper perf-top mt-4 px-4 pt-5 pb-4">
        <OrderLines order={order} currency={currency} />
        {order.notes && <p className="mt-3 text-sm text-ink-2">Note: “{order.notes}”</p>}
        {order.status === 'cancelled' && order.cancel_reason && <p className="mt-3 text-sm font-semibold text-danger">{order.cancel_reason}</p>}
        <div className="mt-3 flex justify-between border-t border-dashed border-line-strong pt-2.5 text-[15px] font-bold">
          <span>Order total</span>
          <Money minor={order.status === 'cancelled' ? 0 : order.total_minor} currency={currency} />
        </div>
      </div>
    </article>
  )
}
