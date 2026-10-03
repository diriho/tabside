import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellRing, ChefHat, CircleSlash, CreditCard, PackageX, Utensils } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Feedback'
import { Sheet } from '@/components/ui/Sheet'
import { cn } from '@/lib/cn'
import { elapsed } from '@/lib/time'
import { listStaffNotifications, markNotificationsRead } from '@/services/operations'
import { staffKeys } from '@/features/staff/staffKeys'
import { useNow } from '@/hooks/useNow'

const ICONS: Record<string, typeof Bell> = {
  'order.new': Utensils,
  'order.ready': ChefHat,
  'order.cancelled': CircleSlash,
  'request.bill': CreditCard,
  'request.waiter': BellRing,
  'session.paid': CreditCard,
  'item.unavailable': PackageX,
}

export function NotificationBell({ restaurantId }: { restaurantId: string }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const now = useNow(30_000)
  const notes = useQuery({ queryKey: staffKeys.notifications(restaurantId), queryFn: () => listStaffNotifications(restaurantId) })
  const unread = (notes.data ?? []).filter((n) => !n.read)

  const markAll = useMutation({
    mutationFn: () => markNotificationsRead(unread.map((n) => n.id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: staffKeys.notifications(restaurantId) }),
  })

  return (
    <>
      <span className="relative">
        <IconButton
          label={unread.length ? `${unread.length} unread notifications` : 'Notifications'}
          onClick={() => {
            setOpen(true)
            if (unread.length) markAll.mutate()
          }}
        >
          <Bell className="size-5" />
        </IconButton>
        {unread.length > 0 && (
          <span className="tnum pointer-events-none absolute top-1 right-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-clay px-1 text-[11px] font-bold text-on-clay">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </span>
      <Sheet open={open} onClose={() => setOpen(false)} title="Notifications">
        {(notes.data ?? []).length === 0 ? (
          <EmptyState icon={<Bell />} title="All quiet" body="New orders, bill requests and kitchen alerts show up here." />
        ) : (
          <ul className="divide-y divide-line">
            {notes.data!.map((n) => {
              const Icon = ICONS[n.type] ?? Bell
              return (
                <li key={n.id} className="flex gap-3 py-3">
                  <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full', n.read ? 'bg-surface-2 text-ink-3' : 'bg-clay-soft text-clay')}>
                    <Icon className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[15px] leading-snug', n.read ? 'font-medium' : 'font-bold')}>{n.title}</p>
                    {n.body && <p className="text-sm text-ink-2">{n.body}</p>}
                  </div>
                  <span className="shrink-0 text-[12px] text-ink-3">{elapsed(n.created_at, now)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Sheet>
    </>
  )
}
