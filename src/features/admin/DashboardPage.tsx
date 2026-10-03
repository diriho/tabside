import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Bell, ChefHat, CreditCard, Flame, PackageX } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { formatCompactMoney as compactMoney, formatMoney } from '@shared/currency'
import { ChartFrame, ColumnChart, StatTile } from '@/components/charts/Charts'
import { TableGrid } from '@/components/tables/TableGrid'
import { ButtonLink } from '@/components/ui/Button'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { useStaffContext } from '@/hooks/useAuth'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/cn'
import { getAnalytics, getDashboard, getTableBoard, listAvailabilityReports } from '@/services/operations'
import { staffKeys } from '@/features/staff/staffKeys'
import { TableDetailSheet } from '@/features/staff/TableDetailSheet'

export default function DashboardPage() {
  const staff = useStaffContext()
  const restaurantId = staff.restaurant.id
  const currency = staff.restaurant.currency
  const now = useNow(30_000)
  const dashboard = useQuery({ queryKey: staffKeys.dashboard(restaurantId), queryFn: () => getDashboard(restaurantId) })
  const board = useQuery({ queryKey: staffKeys.board(restaurantId), queryFn: () => getTableBoard(restaurantId) })
  const reports = useQuery({ queryKey: staffKeys.reports(restaurantId), queryFn: () => listAvailabilityReports(restaurantId) })
  const week = useQuery({ queryKey: [...staffKeys.all(restaurantId), 'analytics', 7], queryFn: () => getAnalytics(restaurantId, 7) })
  const [selected, setSelected] = useState<string | null>(null)

  if (dashboard.isError) return <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
  const d = dashboard.data
  const money = (m: number) => formatMoney(m, currency)
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: staff.restaurant.timezone }).format(now)

  const ops = d
    ? [
        { label: 'New orders', value: d.orders_pending, icon: Bell, to: '/staff/orders', urgent: d.orders_pending > 0 },
        { label: 'In the kitchen', value: d.orders_accepted + d.orders_preparing, icon: Flame, to: '/staff/orders', urgent: false },
        { label: 'Ready to serve', value: d.orders_ready, icon: ChefHat, to: '/staff/orders', urgent: d.orders_ready > 0 },
        { label: 'Bills requested', value: d.open_bill_requests, icon: CreditCard, to: '/staff/tables', urgent: d.open_bill_requests > 0 },
        { label: 'Sold-out reports', value: d.open_availability_reports, icon: PackageX, to: '/admin/menu', urgent: d.open_availability_reports > 0 },
      ]
    : []

  return (
    <div className="space-y-8">
      {/* Hero: the one number a manager checks first, with what's happening around it */}
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[15px] text-ink-2">{today}</p>
          <h1 className="sr-only">Dashboard</h1>
          {d ? (
            <>
              <p className="mt-1 text-[56px] leading-none font-bold tracking-tight" aria-label={`Revenue today ${money(d.revenue_today_minor)}`}>{money(d.revenue_today_minor)}</p>
              <p className="mt-2 text-[15px] text-ink-2">
                taken today across {d.orders_today} {d.orders_today === 1 ? 'order' : 'orders'}.{' '}
                {d.active_tables} of {d.total_tables} tables seated, {d.guests_seated} guests.
              </p>
            </>
          ) : (
            <Skeleton className="mt-2 h-14 w-64" />
          )}
        </div>
        <ButtonLink to="/staff/tables" variant="secondary" icon={<ArrowUpRight className="size-4" />}>Open the floor</ButtonLink>
      </section>

      <section aria-label="Kitchen and service right now" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {d
          ? ops.map((o) => (
              <Link
                key={o.label}
                to={o.to}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3.5 transition-colors hover:bg-surface-2',
                  o.urgent && o.value > 0 ? 'border-clay/50 bg-clay-soft' : 'border-line bg-surface',
                )}
              >
                <o.icon className={cn('size-5 shrink-0', o.urgent && o.value > 0 ? 'text-clay' : 'text-ink-3')} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-2xl leading-none font-bold">{o.value}</span>
                  <span className="block truncate text-[13px] text-ink-2">{o.label}</span>
                </span>
              </Link>
            ))
          : Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[68px] rounded-xl" />)}
      </section>

      {reports.data && reports.data.length > 0 && (
        <section className="rounded-xl border border-clay/40 bg-surface p-4" aria-labelledby="reports-h">
          <h2 id="reports-h" className="flex items-center gap-2 font-bold"><PackageX className="size-5 text-clay" /> Reported unavailable</h2>
          <ul className="mt-2 space-y-1 text-[15px]">
            {reports.data.map((r) => (
              <li key={r.id}><span className="font-semibold">{r.menu_items?.name}</span>{r.note ? ` — ${r.note}` : ''}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-2">These are marked sold out. Turn them back on from <Link to="/admin/menu" className="font-semibold text-clay">Menu</Link> or the availability screen once restocked.</p>
        </section>
      )}

      <section aria-labelledby="floor-h">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="floor-h" className="text-xl font-bold">Floor</h2>
          <Link to="/staff/tables" className="text-sm font-semibold text-clay">Service view</Link>
        </div>
        {board.data ? (
          board.data.length ? (
            <TableGrid tables={board.data} currency={currency} now={now} compact onSelect={(t) => setSelected(t.table_id)} />
          ) : (
            <p className="rounded-xl border border-dashed border-line-strong p-6 text-center text-ink-2">No tables yet. <Link to="/admin/tables" className="font-semibold text-clay">Add tables</Link></p>
          )
        ) : (
          <Skeleton className="h-32 rounded-xl" />
        )}
      </section>

      <section aria-label="Today in numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d ? (
          <>
            <StatTile label="Orders today" value={d.orders_today} note={`${d.orders_completed_today} delivered`} />
            <StatTile label="Average order" value={d.avg_order_minor !== null ? money(d.avg_order_minor) : '—'} note={`Sales ${money(d.sales_today_minor)}`} />
            <StatTile label="Paid orders" value={d.paid_orders_today} note="On settled tabs today" />
            <StatTile label="Pending payments" value={money(d.pending_payments_minor)} note={`${d.tabs_with_balance} open ${d.tabs_with_balance === 1 ? 'tab' : 'tabs'} with a balance`} tone={d.tabs_with_balance > 0 ? 'attention' : undefined} />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        )}
      </section>

      {week.data && (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Last 7 days">
          <ChartFrame
            title="Revenue, last 7 days"
            subtitle="Payments received per day"
            table={{ columns: ['Day', 'Revenue'], rows: week.data.by_day.map((x) => [x.day, money(x.revenue_minor)]) }}
          >
            <ColumnChart
              ariaLabel="Revenue per day for the last 7 days"
              data={week.data.by_day.map((x) => ({ key: x.day, label: new Date(`${x.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }), value: x.revenue_minor }))}
              formatValue={money}
              formatTick={(v) => compactMoney(v, currency)}
            />
          </ChartFrame>
          <ChartFrame
            title="When guests order"
            subtitle="Orders by hour, last 7 days"
            table={{ columns: ['Hour', 'Orders'], rows: week.data.by_hour.map((x) => [`${String(x.hour).padStart(2, '0')}:00`, String(x.orders)]) }}
          >
            <ColumnChart
              ariaLabel="Orders by hour of day for the last 7 days"
              data={week.data.by_hour.map((x) => ({ key: String(x.hour), label: String(x.hour), value: x.orders }))}
              formatValue={(v) => `${v} ${v === 1 ? 'order' : 'orders'}`}
              formatTick={(v) => String(v)}
              labelEvery={3}
            />
          </ChartFrame>
          <div className="lg:col-span-2">
            <Link to="/admin/analytics" className="inline-flex items-center gap-1 text-sm font-semibold text-clay">More analytics <ArrowUpRight className="size-4" /></Link>
          </div>
        </section>
      )}

      <TableDetailSheet
        table={board.data?.find((t) => t.table_id === selected) ?? null}
        restaurantId={restaurantId}
        currency={currency}
        timeZone={staff.restaurant.timezone}
        role={staff.role}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
