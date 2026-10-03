import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackageX, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Sheet'
import { useStaffContext } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { getMenu, reportUnavailable, setAvailability, type FullMenuItem } from '@/services/menu'
import { staffKeys } from './staffKeys'

export default function AvailabilityPage() {
  const staff = useStaffContext()
  const restaurantId = staff.restaurant.id
  const queryClient = useQueryClient()
  const toast = useToast()
  const menu = useQuery({ queryKey: staffKeys.menu(restaurantId), queryFn: () => getMenu(restaurantId) })
  const [query, setQuery] = useState('')
  const [reporting, setReporting] = useState<FullMenuItem | null>(null)
  const [note, setNote] = useState('')

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: staffKeys.menu(restaurantId) })
    void queryClient.invalidateQueries({ queryKey: staffKeys.all(restaurantId) })
  }

  const restore = useMutation({
    mutationFn: (itemId: string) => setAvailability(itemId, 'available'),
    onSuccess: (_d, itemId) => {
      invalidate()
      toast.success(`${menu.data?.items.find((i) => i.id === itemId)?.name ?? 'Item'} is back on`)
    },
    onError: (err) => toast.error('Couldn’t update', errorMessage(err)),
  })
  const report = useMutation({
    mutationFn: () => reportUnavailable(reporting!.id, note.trim() || undefined),
    onSuccess: () => {
      invalidate()
      toast.success(`${reporting?.name} marked sold out`, staff.role === 'manager' ? undefined : 'Your manager has been notified.')
      setReporting(null)
      setNote('')
    },
    onError: (err) => toast.error('Couldn’t update', errorMessage(err)),
  })

  const groups = useMemo(() => {
    if (!menu.data) return []
    const q = query.trim().toLowerCase()
    return menu.data.categories
      .map((c) => ({ category: c, items: menu.data.items.filter((i) => i.category_id === c.id && i.availability !== 'hidden' && (!q || i.name.toLowerCase().includes(q))) }))
      .filter((g) => g.items.length > 0)
  }, [menu.data, query])

  if (menu.isPending) return <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>
  if (menu.isError) return <ErrorState error={menu.error} onRetry={() => void menu.refetch()} className="pt-16" />

  const soldOut = menu.data.items.filter((i) => i.availability === 'sold_out')

  return (
    <div className="mx-auto max-w-3xl p-3 sm:p-5">
      <h1 className="text-2xl font-bold">Availability</h1>
      <p className="text-[15px] text-ink-2">
        Mark anything you’ve run out of. Guests stop seeing it as orderable right away{staff.role !== 'manager' ? ' and your manager is notified' : ''}.
        Prices can only be changed by a manager.
      </p>

      {soldOut.length > 0 && (
        <section className="mt-5 rounded-xl border border-clay/30 bg-clay-soft p-4" aria-labelledby="sold-out-h">
          <h2 id="sold-out-h" className="font-bold">Sold out now ({soldOut.length})</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {soldOut.map((i) => (
              <li key={i.id}>
                <Button size="sm" variant="secondary" loading={restore.isPending && restore.variables === i.id} onClick={() => restore.mutate(i.id)}>
                  {i.name}: back on
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute top-3 left-3.5 size-5 text-ink-3" />
        <Input aria-label="Search the menu" placeholder="Search the menu" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-11" />
      </div>

      {groups.length === 0 ? (
        <EmptyState title="Nothing matches" className="pt-10" />
      ) : (
        groups.map((g) => (
          <section key={g.category.id} className="mt-6" aria-labelledby={`av-${g.category.id}`}>
            <h2 id={`av-${g.category.id}`} className="text-lg font-bold">{g.category.name}</h2>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
              {g.items.map((item) => {
                const out = item.availability === 'sold_out'
                return (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={cn('size-2.5 shrink-0 rounded-full', out ? 'bg-danger' : 'bg-sage')} aria-hidden />
                    <span className={cn('flex-1 font-semibold', out && 'text-ink-3 line-through')}>{item.name}</span>
                    {out ? (
                      <Button size="sm" variant="secondary" loading={restore.isPending && restore.variables === item.id} onClick={() => restore.mutate(item.id)}>
                        Back on
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" icon={<PackageX className="size-4" />} onClick={() => setReporting(item)}>
                        Sold out
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      <Sheet
        open={Boolean(reporting)}
        onClose={() => setReporting(null)}
        title={`Mark ${reporting?.name ?? ''} sold out?`}
        description="Guests won’t be able to order it until it’s back on. It isn’t deleted."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReporting(null)}>Cancel</Button>
            <Button loading={report.isPending} onClick={() => report.mutate()}>Mark sold out</Button>
          </div>
        }
      >
        <Field label="Note for the manager" optional>
          {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Delivery comes tomorrow" data-autofocus />}
        </Field>
      </Sheet>
    </div>
  )
}
