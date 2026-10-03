import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { useState } from 'react'
import { PageHeader, Panel } from '@/components/layout/Page'
import { OrderLines } from '@/components/orders/OrderTicket'
import { Money, StatusPill } from '@/components/ui/Display'
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback'
import { Segmented } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Sheet'
import { useStaffContext } from '@/hooks/useAuth'
import { formatTime, relativeDay } from '@/lib/time'
import { listRecentOrders, type KitchenOrder } from '@/services/operations'
import type { OrderStatus } from '@/types/domain'
import { staffKeys } from '@/features/staff/staffKeys'

type Filter = 'all' | 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled'

export default function OrdersPage() {
  const staff = useStaffContext()
  const restaurantId = staff.restaurant.id
  const currency = staff.restaurant.currency
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<KitchenOrder | null>(null)
  const orders = useQuery({
    queryKey: [...staffKeys.all(restaurantId), 'recent-orders', filter],
    queryFn: () => listRecentOrders(restaurantId, { status: filter as OrderStatus | 'all', limit: 100 }),
  })

  return (
    <div>
      <PageHeader title="Orders" description="Every order, newest first. Updates live as the kitchen works." />
      <Segmented
        label="Filter by status"
        value={filter}
        onChange={setFilter}
        className="mb-5 max-w-full overflow-x-auto"
        options={[
          { value: 'all', label: 'All' },
          { value: 'pending', label: 'New' },
          { value: 'preparing', label: 'Preparing' },
          { value: 'ready', label: 'Ready' },
          { value: 'delivered', label: 'Delivered' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
      />
      <Panel className="p-0 sm:p-0">
        {orders.isPending ? (
          <PageLoader />
        ) : orders.isError ? (
          <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
        ) : orders.data.length === 0 ? (
          <EmptyState icon={<ClipboardList />} title="No orders here" body="Orders appear as soon as guests place them." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <thead className="border-b border-line text-[13px] text-ink-2">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Order</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Table</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Items</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Placed</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.data.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setOpen(o)}>
                    <td className="px-5 py-3">
                      <button type="button" className="font-semibold hover:text-clay" onClick={() => setOpen(o)}>#{o.order_number}</button>
                      <span className="block text-[13px] text-ink-3">Round {o.session_seq}</span>
                    </td>
                    <td className="px-3 py-3 font-semibold">{o.restaurant_tables?.label}</td>
                    <td className="max-w-[260px] truncate px-3 py-3 text-ink-2">
                      {o.order_items.filter((l) => !l.is_voided).map((l) => `${l.quantity}× ${l.name}`).join(', ')}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-ink-2">{relativeDay(o.placed_at)}, {formatTime(o.placed_at, staff.restaurant.timezone)}</td>
                    <td className="px-3 py-3"><StatusPill status={o.status} /></td>
                    <td className="px-5 py-3 text-right font-semibold"><Money minor={o.status === 'cancelled' ? 0 : o.total_minor} currency={currency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Sheet open={Boolean(open)} onClose={() => setOpen(null)} title={open ? `Order #${open.order_number}` : ''} description={open ? `Table ${open.restaurant_tables?.label}, round ${open.session_seq}, ${relativeDay(open.placed_at)} at ${formatTime(open.placed_at, staff.restaurant.timezone)}` : undefined}>
        {open && (
          <div className="space-y-4 pb-2">
            <StatusPill status={open.status} />
            <OrderLines order={open} currency={currency} />
            {open.notes && <p className="text-sm text-ink-2">Note: “{open.notes}”</p>}
            <dl className="space-y-1 border-t border-line pt-3 text-[15px]">
              <div className="flex justify-between"><dt className="text-ink-2">Subtotal</dt><dd><Money minor={open.subtotal_minor} currency={currency} /></dd></div>
              {open.exclusive_tax_minor > 0 && <div className="flex justify-between"><dt className="text-ink-2">Tax</dt><dd><Money minor={open.exclusive_tax_minor} currency={currency} /></dd></div>}
              {open.inclusive_tax_minor > 0 && <div className="flex justify-between"><dt className="text-ink-2">Tax included</dt><dd><Money minor={open.inclusive_tax_minor} currency={currency} /></dd></div>}
              <div className="flex justify-between font-bold"><dt>Total</dt><dd><Money minor={open.total_minor} currency={currency} /></dd></div>
            </dl>
          </div>
        )}
      </Sheet>
    </div>
  )
}
