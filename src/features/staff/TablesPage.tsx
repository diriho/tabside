import { useQuery } from '@tanstack/react-query'
import { LayoutGrid } from 'lucide-react'
import { useState } from 'react'
import { TableGrid, TableLegend } from '@/components/tables/TableGrid'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { useStaffContext } from '@/hooks/useAuth'
import { useNow } from '@/hooks/useNow'
import { getTableBoard } from '@/services/operations'
import { staffKeys } from './staffKeys'
import { TableDetailSheet } from './TableDetailSheet'

export default function TablesPage() {
  const staff = useStaffContext()
  const restaurantId = staff.restaurant.id
  const now = useNow(30_000)
  const board = useQuery({ queryKey: staffKeys.board(restaurantId), queryFn: () => getTableBoard(restaurantId) })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = board.data?.find((t) => t.table_id === selectedId) ?? null

  if (board.isPending) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3 p-5">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[148px] rounded-lg" />)}
      </div>
    )
  }
  if (board.isError) return <ErrorState error={board.error} onRetry={() => void board.refetch()} className="pt-16" />
  if (board.data.length === 0) {
    return (
      <EmptyState
        className="pt-16"
        icon={<LayoutGrid />}
        title="No tables yet"
        body="A manager adds tables and prints their QR codes."
        action={staff.role === 'manager' ? <ButtonLink to="/admin/tables">Add tables</ButtonLink> : undefined}
      />
    )
  }

  const needsAttention = board.data.filter((t) => ['new_order', 'ready', 'bill_requested'].includes(t.state) || t.waiter_called).length

  return (
    <div className="p-3 sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Floor</h1>
          <p className="text-[15px] text-ink-2">
            {needsAttention > 0 ? `${needsAttention} ${needsAttention === 1 ? 'table needs' : 'tables need'} you` : 'Nothing waiting on you right now'}
          </p>
        </div>
        <TableLegend />
      </div>
      <TableGrid tables={board.data} currency={staff.restaurant.currency} now={now} onSelect={(t) => setSelectedId(t.table_id)} />
      <TableDetailSheet
        table={selected}
        restaurantId={restaurantId}
        currency={staff.restaurant.currency}
        timeZone={staff.restaurant.timezone}
        role={staff.role}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}
