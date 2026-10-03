import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChefHat, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TableNumeral } from '@/components/ui/Display'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Segmented } from '@/components/ui/Form'
import { useStaffContext } from '@/hooks/useAuth'
import { useNow } from '@/hooks/useNow'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { advanceSessionOrders, listActiveOrders, type KitchenOrder } from '@/services/operations'
import { KitchenTicket } from './KitchenTicket'
import { staffKeys } from './staffKeys'

type Lane = 'new' | 'cooking' | 'ready'
const LANES: Array<{ id: Lane; title: string; statuses: string[]; empty: string }> = [
  { id: 'new', title: 'New', statuses: ['pending'], empty: 'New orders land here the moment guests place them.' },
  { id: 'cooking', title: 'Cooking', statuses: ['accepted', 'preparing'], empty: 'Accepted orders move here.' },
  { id: 'ready', title: 'Ready to serve', statuses: ['ready'], empty: 'Finished orders wait here for a server.' },
]

export default function KitchenPage() {
  const staff = useStaffContext()
  const restaurantId = staff.restaurant.id
  const now = useNow(15_000)
  const [lane, setLane] = useState<Lane>('new')
  const orders = useQuery({ queryKey: staffKeys.orders(restaurantId), queryFn: () => listActiveOrders(restaurantId) })

  const byLane = useMemo(() => {
    const map: Record<Lane, KitchenOrder[]> = { new: [], cooking: [], ready: [] }
    for (const o of orders.data ?? []) {
      const l = LANES.find((x) => x.statuses.includes(o.status))
      if (l) map[l.id].push(o)
    }
    return map
  }, [orders.data])

  if (orders.isPending) {
    return (
      <div className="grid gap-4 p-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-80 rounded-xl" />)}
      </div>
    )
  }
  if (orders.isError) return <ErrorState error={orders.error} onRetry={() => void orders.refetch()} className="pt-16" />

  const total = orders.data.length
  return (
    <div className="p-3 sm:p-5">
      {/* Phones: one lane at a time. Tablets and up: the full rail. */}
      <div className="mb-4 lg:hidden">
        <Segmented
          label="Lane"
          value={lane}
          onChange={setLane}
          options={LANES.map((l) => ({ value: l.id, label: <>{l.title} <span className="tnum text-ink-3">{byLane[l.id].length}</span></> }))}
        />
      </div>

      {total === 0 ? (
        <EmptyState icon={<ChefHat />} title="No open orders" body="When a table orders, the ticket appears here instantly — no refresh needed." className="pt-16" />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-3">
          {LANES.map((l) => (
            <section key={l.id} aria-labelledby={`lane-${l.id}`} className={cn(lane !== l.id && 'hidden lg:block')}>
              <h2 id={`lane-${l.id}`} className="mb-3 flex items-baseline gap-2 text-lg font-bold">
                {l.title}
                <span className="tnum text-[15px] font-semibold text-ink-3">{byLane[l.id].length}</span>
              </h2>
              {l.id === 'ready' && <DeliverTogether orders={byLane.ready} restaurantId={restaurantId} />}
              {byLane[l.id].length === 0 ? (
                <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-3">{l.empty}</p>
              ) : (
                <div className="space-y-4">
                  {byLane[l.id].map((o) => (
                    <KitchenTicket
                      key={o.id}
                      order={o}
                      restaurantId={restaurantId}
                      role={staff.role}
                      now={now}
                      currency={staff.restaurant.currency}
                      timeZone={staff.restaurant.timezone}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/** When a table has several ready rounds, a server can run them out together. */
function DeliverTogether({ orders, restaurantId }: { orders: KitchenOrder[]; restaurantId: string }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>()
    for (const o of orders) {
      const g = map.get(o.session_id) ?? { label: o.restaurant_tables?.label ?? '?', count: 0 }
      g.count += 1
      map.set(o.session_id, g)
    }
    return [...map.entries()].filter(([, g]) => g.count > 1)
  }, [orders])

  const deliver = useMutation({
    mutationFn: (sessionId: string) => advanceSessionOrders(sessionId, 'ready', 'delivered'),
    onSuccess: (n) => {
      void queryClient.invalidateQueries({ queryKey: staffKeys.all(restaurantId) })
      toast.success(`${n} orders delivered`)
    },
    onError: (err) => toast.error('Couldn’t update', errorMessage(err)),
  })

  if (groups.length === 0) return null
  return (
    <div className="mb-4 space-y-2">
      {groups.map(([sessionId, g]) => (
        <div key={sessionId} className="flex items-center gap-3 rounded-lg border border-sage/40 bg-sage-soft px-3 py-2">
          <TableNumeral label={g.label} size="sm" tone="ink" />
          <p className="flex-1 text-sm font-semibold">{g.count} rounds ready for this table</p>
          <Button variant="sage" size="sm" icon={<Truck className="size-4" />} loading={deliver.isPending && deliver.variables === sessionId} onClick={() => deliver.mutate(sessionId)}>
            Deliver together
          </Button>
        </div>
      ))}
    </div>
  )
}
