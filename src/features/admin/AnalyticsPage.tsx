import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { useState } from 'react'
import { formatCompactMoney as compactMoney, formatMoney } from '@shared/currency'
import { BarList, ChartFrame, ColumnChart, LineChart, StatTile } from '@/components/charts/Charts'
import { PageHeader } from '@/components/layout/Page'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Segmented } from '@/components/ui/Form'
import { useStaffContext } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'
import { getAnalytics } from '@/services/operations'
import { staffKeys } from '@/features/staff/staffKeys'

type Range = '7' | '14' | '30' | '90'

export default function AnalyticsPage() {
  const staff = useStaffContext()
  const restaurantId = staff.restaurant.id
  const currency = staff.restaurant.currency
  const [range, setRange] = useState<Range>('14')
  const analytics = useQuery({
    queryKey: [...staffKeys.all(restaurantId), 'analytics', Number(range)],
    queryFn: () => getAnalytics(restaurantId, Number(range)),
    placeholderData: keepPreviousData,
  })
  const money = (m: number) => formatMoney(m, currency)
  const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, Number(range) <= 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' })
  const labelEvery = Number(range) <= 14 ? (Number(range) <= 7 ? 1 : 2) : Number(range) <= 30 ? 5 : 15

  return (
    <div>
      <PageHeader title="Analytics" description={`All figures in ${currency}, by day in ${staff.restaurant.timezone.replace(/_/g, ' ')} time.`} />

      {/* Filters: one row, above everything they scope */}
      <div className="mb-6">
        <Segmented
          label="Date range"
          value={range}
          onChange={setRange}
          options={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]}
        />
      </div>

      {analytics.isError ? (
        <ErrorState error={analytics.error} onRetry={() => void analytics.refetch()} />
      ) : !analytics.data ? (
        <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}</div>
      ) : analytics.data.totals.orders === 0 ? (
        <EmptyState icon={<BarChart3 />} title="No orders in this period" body="Charts fill in as guests order." />
      ) : (
        // Refetch keeps the frame: previous render stays at reduced opacity.
        <div className={cn('space-y-4 transition-opacity', analytics.isFetching && analytics.isPlaceholderData && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Revenue" value={money(analytics.data.totals.revenue_minor)} note="Payments received" />
            <StatTile label="Sales" value={money(analytics.data.totals.sales_minor)} note="Value of orders placed" />
            <StatTile label="Orders" value={analytics.data.totals.orders.toLocaleString()} />
            <StatTile label="Average order" value={analytics.data.totals.avg_order_minor !== null ? money(analytics.data.totals.avg_order_minor) : '—'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartFrame
              title="Revenue by day"
              subtitle="Payments received"
              table={{ columns: ['Day', 'Revenue'], rows: analytics.data.by_day.map((x) => [x.day, money(x.revenue_minor)]) }}
            >
              <ColumnChart
                ariaLabel={`Revenue per day, last ${range} days`}
                data={analytics.data.by_day.map((x) => ({ key: x.day, label: dayLabel(x.day), value: x.revenue_minor }))}
                formatValue={money}
                formatTick={(v) => compactMoney(v, currency)}
                labelEvery={labelEvery}
              />
            </ChartFrame>
            <ChartFrame
              title="Average order value"
              subtitle="Per day, orders that weren’t cancelled"
              table={{ columns: ['Day', 'Average order'], rows: analytics.data.by_day.map((x) => [x.day, money(x.avg_order_minor)]) }}
            >
              <LineChart
                ariaLabel={`Average order value per day, last ${range} days`}
                data={analytics.data.by_day.map((x) => ({ key: x.day, label: dayLabel(x.day), value: x.avg_order_minor }))}
                formatValue={money}
                formatTick={(v) => compactMoney(v, currency)}
                labelEvery={labelEvery}
              />
            </ChartFrame>
            <ChartFrame
              title="Peak ordering hours"
              subtitle="Orders placed by hour of day"
              table={{ columns: ['Hour', 'Orders'], rows: analytics.data.by_hour.map((x) => [`${String(x.hour).padStart(2, '0')}:00`, String(x.orders)]) }}
            >
              <ColumnChart
                ariaLabel="Orders by hour of day"
                data={analytics.data.by_hour.map((x) => ({ key: String(x.hour), label: String(x.hour), value: x.orders }))}
                formatValue={(v) => `${v} ${v === 1 ? 'order' : 'orders'}`}
                formatTick={(v) => String(v)}
                labelEvery={3}
              />
            </ChartFrame>
            <ChartFrame
              title="Most ordered"
              subtitle="Portions sold"
              table={{ columns: ['Item', 'Portions'], rows: analytics.data.popular_items.map((x) => [x.name, `${x.quantity} (${money(x.sales_minor)})`]) }}
            >
              <BarList
                ariaLabel="Most ordered items by portions sold"
                data={analytics.data.popular_items.map((x) => ({ key: x.name, label: x.name, value: x.quantity }))}
                formatValue={(v) => v.toLocaleString()}
              />
            </ChartFrame>
          </div>
        </div>
      )}
    </div>
  )
}
