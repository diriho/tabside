import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, QrCode, Receipt, UtensilsCrossed } from 'lucide-react'
import { Link } from 'react-router'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { ButtonLink } from '@/components/ui/Button'
import { Monogram, Stars, TableNumeral } from '@/components/ui/Display'
import { unwrap } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export default function HomePage() {
  const { isStaffAccount } = useAuth()
  const restaurants = useQuery({
    queryKey: ['public-restaurants'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('restaurants')
          .select('id, slug, name, tagline, logo_url, rating_count, rating_sum, currency, restaurant_tables(id, label)')
          .is('deleted_at', null)
          .eq('status', 'active')
          .order('name')
          .limit(6),
      ),
  })

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5">
        <Link to="/" className="display text-xl font-extrabold">TAB<span className="text-clay">Side</span></Link>
        <div className="flex-1" />
        <ThemeToggle compact />
        <ButtonLink to={isStaffAccount ? '/staff' : '/login'} variant="ghost" size="sm">{isStaffAccount ? 'Open service view' : 'Staff sign in'}</ButtonLink>
      </header>

      <main className="mx-auto max-w-6xl px-5">
        <section className="grid items-center gap-10 py-12 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div>
            <h1 className="display text-[44px] font-extrabold sm:text-6xl">Skip the waiter for ordering. Keep them for service.</h1>
            <p className="mt-5 max-w-[52ch] text-lg text-ink-2">
              Guests scan the code on their table, order from their phones, and keep adding to one shared tab all evening.
              Your kitchen sees every round the moment it’s placed, and your servers see which tables need them.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/signup" size="lg">Set up your restaurant</ButtonLink>
              <ButtonLink to="/r/the-globe" variant="secondary" size="lg">See a live demo</ButtonLink>
            </div>
          </div>

          {/* A table tent: the physical object guests actually meet */}
          <div className="relative mx-auto w-full max-w-sm" aria-hidden>
            <div className="rounded-xl border border-line bg-surface p-7 shadow-lift">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-2">The Globe</span>
                <QrCode className="size-6 text-ink-3" />
              </div>
              <div className="my-6 flex justify-center">
                <TableNumeral label="12" size="hero" />
              </div>
              <p className="text-center text-[15px] font-semibold">Scan to order and pay</p>
              <p className="text-center text-sm text-ink-2">No app, no account</p>
            </div>
            <div className="paper perf-top absolute -right-4 -bottom-10 w-52 rotate-3 rounded-b-lg border border-t-0 border-line px-4 pt-5 pb-3 shadow-lift">
              <p className="text-[13px] font-bold">Round 3, Table 12</p>
              <p className="tnum mt-1 text-[13px]">2× Chocolate cake</p>
              <p className="tnum text-[13px]">1× Espresso</p>
              <p className="mt-2 inline-flex rounded-full bg-sage px-2 py-0.5 text-[11px] font-bold text-white">Ready</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 border-t border-line py-14 md:grid-cols-3" aria-label="How it works">
          {[
            { icon: QrCode, title: 'Scan and join the table', body: 'Every phone at the table joins the same tab. Say how many people are eating — that’s it.' },
            { icon: UtensilsCrossed, title: 'Order in rounds', body: 'Starters now, dessert later. Each round goes straight to the kitchen and shows live status.' },
            { icon: Receipt, title: 'Pay or ask for the check', body: 'Settle the whole table online, or tap once and your server brings the check.' },
          ].map(({ icon: Icon, title, body }, i) => (
            <div key={title}>
              <div className="flex items-center gap-3">
                <span className="display inline-flex size-10 items-center justify-center rounded-full bg-brass-soft text-lg font-extrabold text-brass-ink">{i + 1}</span>
                <Icon className="size-5 text-ink-3" aria-hidden />
              </div>
              <h2 className="mt-4 text-xl font-bold">{title}</h2>
              <p className="mt-1.5 text-ink-2">{body}</p>
            </div>
          ))}
        </section>

        {restaurants.data && restaurants.data.length > 0 && (
          <section className="border-t border-line py-14" aria-labelledby="demo-h">
            <h2 id="demo-h" className="display text-3xl font-extrabold">Try it as a guest</h2>
            <p className="mt-1 text-ink-2">Open a table on another phone or browser window to see the shared tab in action.</p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {restaurants.data.map((r) => {
                const avg = r.rating_count ? r.rating_sum / r.rating_count : null
                const tables = [...(r.restaurant_tables ?? [])].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
                return (
                  <li key={r.id} className="rounded-xl border border-line bg-surface p-5">
                    <Link to={`/r/${r.slug}`} className="group flex items-center gap-3">
                      <Monogram name={r.name} src={r.logo_url} className="size-11" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold group-hover:text-clay">{r.name}</p>
                        <p className="truncate text-sm text-ink-2">{r.tagline}</p>
                      </div>
                      {avg !== null && <span className="flex items-center gap-1.5 text-sm"><Stars value={avg} size="sm" /><span className="tnum font-semibold">{avg.toFixed(1)}</span></span>}
                      <ArrowUpRight className="size-4 text-ink-3" />
                    </Link>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {tables.slice(0, 6).map((t) => (
                        <ButtonLink key={t.id} to={`/r/${r.slug}/table/${t.id}`} variant="secondary" size="sm">
                          Table {t.label}
                        </ButtonLink>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </main>
      <footer className="mx-auto max-w-6xl border-t border-line px-5 py-8 text-sm text-ink-3">TABSide — table ordering for restaurants and hotels.</footer>
    </div>
  )
}
