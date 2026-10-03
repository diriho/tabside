import { useMutation, useQuery } from '@tanstack/react-query'
import { DoorClosed, QrCode, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Monogram, Photo, Stars, TableNumeral } from '@/components/ui/Display'
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '@/components/ui/Feedback'
import { Stepper } from '@/components/ui/Form'
import { errorMessage } from '@/lib/errors'
import { getTableEntry } from '@/services/restaurants'
import { getSessionContext, joinTable } from '@/services/sessions'
import { rememberedTab, rememberTab } from './guestContext'

export default function TableEntryPage() {
  const { slug = '', tableId = '' } = useParams()
  const navigate = useNavigate()
  const entry = useQuery({ queryKey: ['table-entry', tableId], queryFn: () => getTableEntry(tableId), refetchInterval: 20_000 })
  const [party, setParty] = useState<number | null>(null)

  // If this phone already joined this table's current tab, offer to go straight back.
  const previous = rememberedTab(tableId)
  const previousTab = useQuery({
    queryKey: ['previous-tab', previous],
    enabled: Boolean(previous),
    queryFn: () => getSessionContext(previous!),
  })
  const canResume = previousTab.data && ['open', 'bill_requested', 'paid'].includes(previousTab.data.session.status)

  const data = entry.data
  useEffect(() => {
    if (data && party === null) setParty(data.active_session?.party_size ?? Math.min(data.table.capacity, 2))
  }, [data, party])

  const join = useMutation({
    mutationFn: () => joinTable(tableId, data?.active_session && party === data.active_session.party_size ? undefined : party ?? undefined),
    onSuccess: (res) => {
      rememberTab(tableId, res.session_id)
      navigate(`/session/${res.session_id}`, { replace: true })
    },
  })

  if (entry.isPending) return <EntrySkeleton />
  if (entry.isError) return <ErrorState error={entry.error} onRetry={() => void entry.refetch()} className="pt-24" />
  if (!data || data.restaurant.slug !== slug) {
    return (
      <main className="mx-auto max-w-md pt-20">
        <EmptyState
          icon={<QrCode />}
          title="We couldn’t find this table"
          body="The QR code may be out of date. Ask a member of staff to help you order."
          action={<ButtonLink to="/" variant="secondary">Go to TABSide</ButtonLink>}
        />
      </main>
    )
  }

  const { restaurant, table, active_session: active } = data
  const closed = restaurant.status !== 'active'
  const unavailable = !table.is_active

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <div className="relative h-[34dvh] min-h-56">
        <Photo src={restaurant.hero_image_url} alt="" className="absolute inset-0" />
        <div className="absolute inset-0 bg-linear-to-t from-bg via-bg/30 to-transparent" />
      </div>

      <section className="relative -mt-20 flex flex-1 flex-col px-5">
        <div className="flex items-end gap-3">
          <Monogram name={restaurant.name} src={restaurant.logo_url} className="size-16 text-xl ring-4 ring-bg" />
          <div className="min-w-0 pb-1">
            <h1 className="display truncate text-[28px] font-extrabold">{restaurant.name}</h1>
            {restaurant.rating_avg !== null && restaurant.rating_count > 0 ? (
              <Link to={`/r/${restaurant.slug}`} className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
                <Stars value={restaurant.rating_avg} size="sm" />
                <span className="tnum font-semibold text-ink">{restaurant.rating_avg.toFixed(1)}</span>
                <span>({restaurant.rating_count})</span>
              </Link>
            ) : (
              restaurant.tagline && <p className="text-sm text-ink-2">{restaurant.tagline}</p>
            )}
          </div>
        </div>

        {closed ? (
          <EmptyState
            className="mt-6 rounded-xl border border-line bg-surface"
            icon={<DoorClosed />}
            title={`${restaurant.name} isn’t taking orders right now`}
            body="You can still look at the menu."
            action={<ButtonLink to={`/r/${restaurant.slug}/menu`} variant="secondary">View the menu</ButtonLink>}
          />
        ) : unavailable ? (
          <EmptyState
            className="mt-6 rounded-xl border border-line bg-surface"
            icon={<DoorClosed />}
            title={`Table ${table.label} isn’t taking orders`}
            body="Ask a member of staff to help you order."
          />
        ) : (
          <div className="mt-6 flex flex-1 flex-col">
            <div className="flex items-center gap-5 rounded-xl border border-line bg-surface p-5 shadow-soft">
              <div className="flex size-28 shrink-0 items-center justify-center rounded-full border-2 border-brass/50 bg-brass-soft">
                <TableNumeral label={table.label} size={table.label.length > 3 ? 'md' : 'lg'} tone="brass" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink-2">{active ? 'You’re joining' : 'You’re at'}</p>
                <p className="display text-[26px] font-extrabold leading-tight">Table {table.label}</p>
                <p className="mt-1 text-sm text-ink-2">
                  {active
                    ? `${active.guest_count} ${active.guest_count === 1 ? 'phone is' : 'phones are'} already on this table’s tab. You’ll share it.`
                    : 'Everyone at the table shares one tab. Order as many rounds as you like.'}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4 px-1">
              <div>
                <p className="flex items-center gap-2 font-bold"><Users className="size-5 text-ink-2" /> How many people?</p>
                <p className="text-sm text-ink-2">Seats up to {table.capacity}</p>
              </div>
              <Stepper label="people at the table" value={party ?? 2} min={1} max={50} onChange={setParty} />
            </div>

            {join.isError && <InlineAlert tone="danger" className="mt-5">{errorMessage(join.error)}</InlineAlert>}

            <div className="mt-auto space-y-3 pt-8 pb-[max(env(safe-area-inset-bottom),20px)]">
              {canResume && previous !== null && (
                <ButtonLink to={`/session/${previous}`} variant="secondary" size="xl" block>
                  Return to your tab
                </ButtonLink>
              )}
              <Button size="xl" block loading={join.isPending} onClick={() => join.mutate()}>
                Join Table {table.label}
              </Button>
              <p className="text-center text-[13px] text-ink-3">
                No app or account needed. Not your table? Ask a member of staff.
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

function EntrySkeleton() {
  return (
    <main className="mx-auto max-w-xl">
      <Skeleton className="h-[34dvh] min-h-56 rounded-none" />
      <div className="space-y-4 px-5 pt-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-12 w-full" />
      </div>
    </main>
  )
}
