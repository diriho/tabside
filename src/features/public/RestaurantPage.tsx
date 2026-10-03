import { useQuery } from '@tanstack/react-query'
import { AtSign, Clock, Globe, Mail, MapPin, Phone, Store } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { DAYS, DAY_LABELS, formatClock, formatPeriods, openStatus, zonedNow, type OpeningHours } from '@shared/hours'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Monogram, Photo, Stars } from '@/components/ui/Display'
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback'
import { Sheet } from '@/components/ui/Sheet'
import { cn } from '@/lib/cn'
import { relativeDay } from '@/lib/time'
import { unwrap } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { getRestaurantBySlug, listPublicReviews } from '@/services/restaurants'

export default function RestaurantPage() {
  const { slug = '' } = useParams()
  const restaurant = useQuery({ queryKey: ['restaurant', slug], queryFn: () => getRestaurantBySlug(slug) })
  const r = restaurant.data
  const reviews = useQuery({ queryKey: ['public-reviews', r?.id], queryFn: () => listPublicReviews(r!.id), enabled: Boolean(r) })
  const [choosingTable, setChoosingTable] = useState(false)

  if (restaurant.isPending) return <PageLoader />
  if (restaurant.isError) return <ErrorState error={restaurant.error} onRetry={() => void restaurant.refetch()} className="pt-24" />
  if (!r) {
    return (
      <main className="mx-auto max-w-md pt-20">
        <EmptyState icon={<Store />} title="This restaurant isn’t on TABSide" body="Check the link, or scan the QR code on your table." action={<ButtonLink to="/">Go to TABSide</ButtonLink>} />
      </main>
    )
  }

  const hours = r.opening_hours as OpeningHours
  const hasHours = DAYS.some((d) => (hours[d]?.length ?? 0) > 0)
  const status = hasHours ? openStatus(hours, r.timezone) : null
  const avg = r.rating_count > 0 ? r.rating_sum / r.rating_count : null
  const today = zonedNow(r.timezone).day
  const closed = r.status !== 'active'

  return (
    <div className="min-h-dvh pb-16">
      <div className="relative h-[42dvh] min-h-72 md:h-[52dvh]">
        <Photo src={r.hero_image_url} alt="" className="absolute inset-0" />
        <div className="absolute inset-0 bg-linear-to-t from-bg via-bg/20 to-black/20" />
        <div className="absolute top-0 right-0 left-0 mx-auto flex max-w-5xl items-center justify-between px-4 pt-4">
          <Link to="/" className="display rounded-full bg-surface/85 px-3 py-1.5 text-sm font-extrabold backdrop-blur">TAB<span className="text-clay">Side</span></Link>
          <div className="rounded-full bg-surface/85 backdrop-blur"><ThemeToggle compact /></div>
        </div>
      </div>

      <main className="relative mx-auto -mt-24 max-w-5xl px-5">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex items-end gap-4">
            <Monogram name={r.name} src={r.logo_url} className="size-20 text-2xl ring-4 ring-bg" />
            <div className="pb-1">
              <h1 className="display text-[40px] font-extrabold md:text-5xl">{r.name}</h1>
              {r.tagline && <p className="text-[17px] text-ink-2">{r.tagline}</p>}
            </div>
          </div>
          {avg !== null && (
            <a href="#reviews" className="flex items-center gap-3 self-start rounded-xl border border-line bg-surface px-4 py-3 md:self-auto">
              <span className="display text-4xl font-extrabold tnum">{avg.toFixed(1)}</span>
              <span>
                <Stars value={avg} />
                <span className="block text-sm text-ink-2">{r.rating_count} {r.rating_count === 1 ? 'review' : 'reviews'}</span>
              </span>
            </a>
          )}
        </div>

        {closed && (
          <p className="mt-6 rounded-lg bg-surface-2 px-4 py-3 font-semibold">{r.name} is closed and isn’t taking orders right now.</p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" onClick={() => setChoosingTable(true)} disabled={closed || !r.ordering_enabled}>Place an order</Button>
          <ButtonLink to={`/r/${r.slug}/menu`} variant="secondary" size="lg">View menu</ButtonLink>
        </div>

        <div className="mt-12 grid gap-12 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-10">
            {r.description && (
              <section>
                <h2 className="sr-only">About</h2>
                <p className="max-w-[62ch] text-[17px] leading-relaxed">{r.description}</p>
              </section>
            )}

            {r.gallery_urls.length > 0 && (
              <section aria-label="Photos" className="grid grid-cols-3 gap-2">
                {r.gallery_urls.slice(0, 3).map((url) => (
                  <Photo key={url} src={url} alt="" className="aspect-[4/5] rounded-lg" />
                ))}
              </section>
            )}

            <section id="reviews" aria-labelledby="reviews-h" className="scroll-mt-6">
              <h2 id="reviews-h" className="text-2xl font-bold">What guests say</h2>
              {reviews.data && reviews.data.length > 0 ? (
                <ul className="mt-4 space-y-4">
                  {reviews.data.map((review) => (
                    <li key={review.id} className="rounded-xl border border-line bg-surface p-5">
                      <div className="flex items-center justify-between gap-3">
                        <Stars value={review.rating} size="sm" />
                        <span className="text-[13px] text-ink-3">{relativeDay(review.created_at)}</span>
                      </div>
                      <p className="mt-2 text-[16px] leading-relaxed">“{review.body}”</p>
                      <p className="mt-2 text-sm font-semibold text-ink-2">{review.guest_name ?? 'A guest'}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-ink-2">{avg !== null ? 'Guests have rated their visits — written reviews will appear here.' : 'No reviews yet.'}</p>
              )}
            </section>
          </div>

          <aside className="space-y-8">
            {status && (
              <section aria-labelledby="hours-h">
                <h2 id="hours-h" className="flex items-center gap-2 text-lg font-bold">
                  <Clock className="size-5 text-ink-3" /> Opening hours
                </h2>
                <p className={cn('mt-1 text-sm font-semibold', status.open ? 'text-sage' : 'text-ink-2')}>
                  {status.open ? `Open now, until ${formatClock(status.closesAt!)}` : status.opensAt ? `Closed, opens at ${formatClock(status.opensAt)}` : 'Closed now'}
                </p>
                <dl className="mt-3 space-y-1 text-[15px]">
                  {DAYS.map((d) => (
                    <div key={d} className={cn('flex justify-between gap-4', d === today && 'font-bold')}>
                      <dt>{DAY_LABELS[d]}</dt>
                      <dd className="tnum text-right">{formatPeriods(hours[d])}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            <section aria-label="Contact" className="space-y-3 text-[15px]">
              {r.address && (
                <a href={`https://maps.google.com/?q=${encodeURIComponent(r.address)}`} target="_blank" rel="noreferrer" className="flex gap-3 hover:text-clay">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-ink-3" />{r.address}
                </a>
              )}
              {r.phone && <a href={`tel:${r.phone.replace(/\s/g, '')}`} className="flex gap-3 hover:text-clay"><Phone className="size-5 shrink-0 text-ink-3" />{r.phone}</a>}
              {r.email && <a href={`mailto:${r.email}`} className="flex gap-3 hover:text-clay"><Mail className="size-5 shrink-0 text-ink-3" />{r.email}</a>}
              {r.instagram_handle && (
                <a href={`https://instagram.com/${r.instagram_handle.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="flex gap-3 hover:text-clay">
                  <AtSign className="size-5 shrink-0 text-ink-3" />@{r.instagram_handle.replace(/^@/, '')}
                </a>
              )}
              {r.website_url && (
                <a href={r.website_url} target="_blank" rel="noreferrer" className="flex gap-3 hover:text-clay">
                  <Globe className="size-5 shrink-0 text-ink-3" />{r.website_url.replace(/^https?:\/\//, '')}
                </a>
              )}
            </section>
          </aside>
        </div>
      </main>

      <ChooseTableSheet open={choosingTable} onClose={() => setChoosingTable(false)} restaurantId={r.id} slug={r.slug} />
    </div>
  )
}

function ChooseTableSheet({ open, onClose, restaurantId, slug }: { open: boolean; onClose: () => void; restaurantId: string; slug: string }) {
  const navigate = useNavigate()
  const tables = useQuery({
    queryKey: ['public-tables', restaurantId],
    enabled: open,
    queryFn: async () =>
      unwrap(await supabase.from('restaurant_tables').select('id, label, capacity, is_active').eq('restaurant_id', restaurantId).order('sort_order').order('label')),
  })
  return (
    <Sheet open={open} onClose={onClose} title="Which table are you at?" description="The fastest way is to scan the QR code on your table. Or pick it here.">
      <div className="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4">
        {(tables.data ?? []).filter((t) => t.is_active).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate(`/r/${slug}/table/${t.id}`)}
            className="flex aspect-square flex-col items-center justify-center rounded-lg border border-line bg-surface-2 transition-colors hover:border-brass hover:bg-brass-soft"
          >
            <span className="display text-3xl font-extrabold text-brass-ink tnum">{t.label}</span>
            <span className="text-[12px] text-ink-2">Seats {t.capacity}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
