import { Bell, ChefHat, CircleCheck, CreditCard, Flame, Hand, Users } from 'lucide-react'
import { Money, TableNumeral } from '@/components/ui/Display'
import { cn } from '@/lib/cn'
import { elapsed } from '@/lib/time'
import type { BoardTable, TableState } from '@/types/domain'

export const TABLE_STATE: Record<TableState, { label: string; icon: typeof Bell | null; tile: string; badge: string }> = {
  idle: { label: 'Free', icon: null, tile: 'border-line bg-surface text-ink-3', badge: 'bg-surface-2 text-ink-3' },
  active: { label: 'Seated', icon: Users, tile: 'border-line-strong bg-surface', badge: 'bg-surface-2 text-ink-2' },
  new_order: { label: 'New order', icon: Bell, tile: 'border-brass bg-brass-soft ring-2 ring-brass/35', badge: 'bg-brass text-white [:root[data-theme=dark]_&]:text-bg' },
  preparing: { label: 'In the kitchen', icon: Flame, tile: 'border-clay/40 bg-clay-soft', badge: 'bg-clay text-on-clay' },
  ready: { label: 'Ready to serve', icon: ChefHat, tile: 'border-sage bg-sage-soft ring-2 ring-sage/35', badge: 'bg-sage text-white [:root[data-theme=dark]_&]:text-bg' },
  bill_requested: { label: 'Bill requested', icon: CreditCard, tile: 'border-clay bg-surface ring-2 ring-clay/40', badge: 'bg-ink text-bg' },
  paid: { label: 'Paid', icon: CircleCheck, tile: 'border-sage/50 bg-surface', badge: 'bg-sage-soft text-sage' },
}

export function TableGrid({
  tables,
  currency,
  now,
  onSelect,
  compact,
}: {
  tables: BoardTable[]
  currency: string
  now: number
  onSelect?: (t: BoardTable) => void
  compact?: boolean
}) {
  return (
    <ul className={cn('grid gap-3', compact ? 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(168px,1fr))]')}>
      {tables.map((t) => {
        const s = TABLE_STATE[t.state]
        const Icon = s.icon
        const attention = ['new_order', 'ready', 'bill_requested'].includes(t.state) || t.waiter_called
        return (
          <li key={t.table_id}>
            <button
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(t)}
              aria-label={`Table ${t.label}: ${s.label}${t.waiter_called ? ', calling for service' : ''}`}
              className={cn(
                'relative flex w-full flex-col items-start rounded-lg border p-3.5 text-left transition-[transform,box-shadow] enabled:hover:shadow-soft enabled:active:scale-[0.98]',
                compact ? 'min-h-[118px]' : 'min-h-[148px]',
                s.tile,
              )}
            >
              <div className="flex w-full items-start justify-between">
                <TableNumeral label={t.label} size={compact ? 'md' : 'lg'} tone={t.state === 'idle' ? 'brass' : 'ink'} className={cn(t.state === 'idle' && 'opacity-60')} />
                {t.waiter_called && (
                  <span className="inline-flex size-8 animate-pulse-ring items-center justify-center rounded-full bg-clay text-on-clay" title="Calling for service">
                    <Hand className="size-4" />
                  </span>
                )}
              </div>
              <span className={cn('mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold whitespace-nowrap', s.badge, attention && 'shadow-soft')}>
                {Icon && <Icon className="size-3.5" />}
                {s.label}
              </span>
              {t.session_id && (
                <div className="mt-auto w-full pt-2 text-[13px] text-ink-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{t.party_size}</span>
                    {t.due_minor > 0 ? <Money minor={t.due_minor} currency={currency} className="font-semibold text-ink" /> : t.total_minor > 0 ? <span className="font-semibold text-sage">Settled</span> : null}
                  </div>
                  {!compact && t.opened_at && <p className="mt-0.5 text-[12px] text-ink-3">Seated {elapsed(t.opened_at, now)}</p>}
                </div>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function TableLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2">
      {(['new_order', 'preparing', 'ready', 'bill_requested', 'paid', 'active', 'idle'] as TableState[]).map((k) => {
        const s = TABLE_STATE[k]
        const Icon = s.icon
        return (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span className={cn('inline-flex size-5 items-center justify-center rounded-full', s.badge)}>{Icon && <Icon className="size-3" />}</span>
            {s.label}
          </li>
        )
      })}
    </ul>
  )
}
