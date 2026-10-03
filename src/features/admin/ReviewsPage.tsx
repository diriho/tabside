import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, MessageSquareQuote, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader, Panel } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Stars } from '@/components/ui/Display'
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback'
import { Segmented } from '@/components/ui/Form'
import { useStaffContext } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { relativeDay } from '@/lib/time'
import { listAllReviews, moderateReview } from '@/services/operations'
import { getReviewSettings, updateReviewSettings } from '@/services/restaurants'

type Filter = 'all' | 'written' | 'featured' | 'hidden'

export default function ReviewsPage() {
  const staff = useStaffContext()
  const restaurantId = staff.restaurant.id
  const queryClient = useQueryClient()
  const toast = useToast()
  const reviews = useQuery({ queryKey: ['admin', restaurantId, 'reviews'], queryFn: () => listAllReviews(restaurantId) })
  const settings = useQuery({ queryKey: ['admin', restaurantId, 'review-settings'], queryFn: () => getReviewSettings(restaurantId) })
  const [filter, setFilter] = useState<Filter>('written')

  const moderate = useMutation({
    mutationFn: (v: { id: string; hidden: boolean; featured: boolean }) => moderateReview(v.id, v.hidden, v.featured),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', restaurantId, 'reviews'] }),
    onError: (err) => toast.error('Couldn’t update the review', errorMessage(err)),
  })
  const setMode = useMutation({
    mutationFn: (mode: 'all_visible' | 'featured_only') => updateReviewSettings(restaurantId, mode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', restaurantId, 'review-settings'] })
      toast.success('Display setting saved')
    },
  })

  const stats = useMemo(() => {
    const list = reviews.data ?? []
    const dist = [5, 4, 3, 2, 1].map((n) => ({ stars: n, count: list.filter((r) => r.rating === n).length }))
    const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : null
    return { dist, avg, total: list.length }
  }, [reviews.data])

  if (reviews.isPending) return <PageLoader />
  if (reviews.isError) return <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />

  const filtered = reviews.data.filter((r) =>
    filter === 'written' ? Boolean(r.body) : filter === 'featured' ? r.is_featured : filter === 'hidden' ? r.is_hidden : true,
  )

  return (
    <div>
      <PageHeader title="Reviews" description="You choose which written reviews appear on your public page. Star ratings always count toward your average and can’t be edited." />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Panel>
            {stats.avg === null ? (
              <p className="text-ink-2">No ratings yet.</p>
            ) : (
              <>
                <p className="display text-5xl font-extrabold tnum">{stats.avg.toFixed(2)}</p>
                <Stars value={stats.avg} size="lg" className="mt-1" />
                <p className="mt-1 text-sm text-ink-2">{stats.total} ratings</p>
                <ul className="mt-4 space-y-1.5" aria-label="Rating distribution">
                  {stats.dist.map((d) => (
                    <li key={d.stars} className="flex items-center gap-2 text-sm">
                      <span className="tnum w-3">{d.stars}</span>
                      <Star className="size-3.5 text-brass" fill="currentColor" strokeWidth={0} aria-hidden />
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-brass" style={{ width: `${stats.total ? (d.count / stats.total) * 100 : 0}%` }} />
                      </span>
                      <span className="tnum w-8 text-right text-ink-2">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
          <Panel title="On your public page">
            <Segmented
              label="Which reviews are public"
              value={settings.data?.display_mode ?? 'all_visible'}
              onChange={(v) => setMode.mutate(v)}
              options={[{ value: 'all_visible', label: 'All not hidden' }, { value: 'featured_only', label: 'Featured only' }]}
            />
            <p className="mt-3 text-sm text-ink-2">
              {settings.data?.display_mode === 'featured_only'
                ? 'Only reviews you feature are shown.'
                : 'Every written review is shown unless you hide it. Featured ones appear first.'}
            </p>
          </Panel>
        </div>

        <div>
          <Segmented
            label="Filter reviews"
            value={filter}
            onChange={setFilter}
            className="mb-4"
            options={[{ value: 'written', label: 'Written' }, { value: 'all', label: 'All' }, { value: 'featured', label: 'Featured' }, { value: 'hidden', label: 'Hidden' }]}
          />
          {filtered.length === 0 ? (
            <Panel><EmptyState icon={<MessageSquareQuote />} title="No reviews here" body="Guests can review their visit once their tab is settled." /></Panel>
          ) : (
            <ul className="space-y-3">
              {filtered.map((r) => (
                <li key={r.id} className={cn('rounded-xl border bg-surface p-5', r.is_featured ? 'border-brass' : 'border-line', r.is_hidden && 'opacity-70')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} size="sm" />
                    <span className="text-sm font-semibold">{r.guest_name ?? 'A guest'}</span>
                    <span className="text-sm text-ink-3">{relativeDay(r.created_at)}</span>
                    {r.is_featured && <span className="rounded-full bg-brass-soft px-2 py-0.5 text-[12px] font-bold text-brass-ink">Featured</span>}
                    {r.is_hidden && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-bold text-ink-2">Hidden</span>}
                  </div>
                  {r.body ? <p className="mt-2 text-[15.5px] leading-relaxed">“{r.body}”</p> : <p className="mt-2 text-sm text-ink-3">Rating only, no written review.</p>}
                  {r.body && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={r.is_featured ? 'primary' : 'secondary'}
                        disabled={r.is_hidden}
                        icon={<Star className="size-4" />}
                        onClick={() => moderate.mutate({ id: r.id, hidden: r.is_hidden, featured: !r.is_featured })}
                      >
                        {r.is_featured ? 'Featured' : 'Feature'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={r.is_hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                        onClick={() => moderate.mutate({ id: r.id, hidden: !r.is_hidden, featured: false })}
                      >
                        {r.is_hidden ? 'Show publicly' : 'Hide from public'}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
