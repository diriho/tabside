import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, FileText, UtensilsCrossed } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { CategoryNav, MenuSections, useMenuSections } from '@/components/menu/MenuSections'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback'
import { Segmented } from '@/components/ui/Form'
import { getMenu } from '@/services/menu'
import { getRestaurantBySlug } from '@/services/restaurants'

export default function PublicMenuPage() {
  const { slug = '' } = useParams()
  const restaurant = useQuery({ queryKey: ['restaurant', slug], queryFn: () => getRestaurantBySlug(slug) })
  const r = restaurant.data
  const menu = useQuery({ queryKey: ['menu', r?.id], queryFn: () => getMenu(r!.id), enabled: Boolean(r) })
  const sections = useMenuSections(menu.data)
  const hasPdf = r?.menu_mode === 'pdf' && Boolean(r.menu_pdf_url)
  const [view, setView] = useState<'pdf' | 'html' | null>(null)
  const mode = view ?? (hasPdf ? 'pdf' : 'html')

  if (restaurant.isPending) return <PageLoader />
  if (restaurant.isError) return <ErrorState error={restaurant.error} onRetry={() => void restaurant.refetch()} className="pt-24" />
  if (!r) return <EmptyState title="Menu not found" className="pt-24" action={<ButtonLink to="/">Go to TABSide</ButtonLink>} />

  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line/70 bg-bg/90 px-4 backdrop-blur-md">
        <ButtonLink to={`/r/${r.slug}`} variant="quiet" size="sm" className="-ml-2" icon={<ArrowLeft className="size-4" />}>{r.name}</ButtonLink>
        <div className="flex-1" />
        {hasPdf && sections.length > 0 && (
          <Segmented
            label="Menu format"
            value={mode}
            onChange={setView}
            options={[{ value: 'pdf', label: 'PDF' }, { value: 'html', label: 'Browse' }]}
          />
        )}
      </header>

      <main className="px-4 pb-16">
        <h1 className="display pt-6 text-[34px] font-extrabold">Menu</h1>
        <p className="text-[15px] text-ink-2">To order, scan the QR code on your table.</p>

        {mode === 'pdf' && r.menu_pdf_url ? (
          <div className="mt-5">
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <object data={`${r.menu_pdf_url}#view=FitH`} type="application/pdf" aria-label={`${r.name} menu (PDF)`} className="h-[75dvh] w-full">
                <EmptyState
                  icon={<FileText />}
                  title="Your browser can’t show the PDF here"
                  action={<ButtonLink to={r.menu_pdf_url} target="_blank" rel="noreferrer">Open the menu PDF</ButtonLink>}
                />
              </object>
            </div>
            <a href={r.menu_pdf_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-clay">
              Open full screen <ExternalLink className="size-4" />
            </a>
          </div>
        ) : menu.isPending ? (
          <PageLoader label="Loading the menu" />
        ) : menu.isError ? (
          <ErrorState error={menu.error} onRetry={() => void menu.refetch()} />
        ) : sections.length === 0 ? (
          <EmptyState icon={<UtensilsCrossed />} title="The menu is being updated" body="Check back soon." />
        ) : (
          <>
            <CategoryNav sections={sections} offset={64} />
            <MenuSections sections={sections} currency={r.currency} readOnly />
          </>
        )}
      </main>
    </div>
  )
}
