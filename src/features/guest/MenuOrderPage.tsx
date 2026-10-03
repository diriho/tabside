import { ShoppingBag, UtensilsCrossed } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { formatMoney } from '@shared/currency'
import { CategoryNav, MenuSections, useMenuSections } from '@/components/menu/MenuSections'
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '@/components/ui/Feedback'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/cn'
import type { FullMenuItem } from '@/services/menu'
import { ItemSheet } from './ItemSheet'
import { useGuest } from './guestContext'

export default function MenuOrderPage() {
  const { sessionId, ctx, menu, menuLoading, menuError, cart, canOrder, orderBlockedReason } = useGuest()
  const [open, setOpen] = useState<FullMenuItem | null>(null)
  const [bump, setBump] = useState(0)
  const navigate = useNavigate()
  const toast = useToast()
  const sections = useMenuSections(menu)
  const currency = ctx.restaurant.currency

  const cartCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of cart.lines) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.quantity)
    return m
  }, [cart.lines])

  const added = (name: string, quantity: number) => {
    setBump((b) => b + 1)
    toast.toast(`${quantity > 1 ? `${quantity} × ` : ''}${name} added`, { duration: 1800 })
  }

  if (menuLoading) {
    return (
      <div className="space-y-4 px-4 pt-6">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    )
  }
  if (menuError) return <ErrorState error={menuError} className="pt-16" />
  if (sections.length === 0) {
    return <EmptyState icon={<UtensilsCrossed />} title="The menu is being updated" body="Ask a member of staff what’s available today." className="pt-16" />
  }

  const count = cart.summary.item_count
  return (
    <div className="px-4">
      {orderBlockedReason && <InlineAlert tone="warning" className="mt-4">{orderBlockedReason}</InlineAlert>}
      <CategoryNav sections={sections} offset={64} />
      <MenuSections
        sections={sections}
        currency={currency}
        readOnly={!canOrder}
        cartCounts={cartCounts}
        onSelect={setOpen}
        onQuickAdd={(item) => {
          cart.add({ itemId: item.id, variantId: null, modifierIds: [], quantity: 1, notes: '' })
          added(item.name, 1)
        }}
      />
      <p className="py-10 text-center text-[13px] text-ink-3">Prices in {currency}. Taxes are shown before you order.</p>

      <ItemSheet
        item={open}
        currency={currency}
        onClose={() => setOpen(null)}
        onAdd={(line) => {
          cart.add(line)
          added(open?.name ?? 'Item', line.quantity)
          setOpen(null)
        }}
      />

      {count > 0 && canOrder && (
        <div className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-30 px-3 pb-3">
          <button
            type="button"
            onClick={() => navigate(`/session/${sessionId}/order`)}
            className="mx-auto flex h-15 w-full max-w-xl items-center gap-3 rounded-xl bg-clay px-4 text-on-clay shadow-lift transition-transform active:scale-[0.99]"
          >
            <span key={bump} className={cn('tnum inline-flex size-9 items-center justify-center rounded-full bg-on-clay/15 text-[15px] font-bold', bump > 0 && 'animate-pop')}>
              {count}
            </span>
            <span className="flex-1 text-left text-[16px] font-bold">Review order</span>
            <span className="tnum text-[16px] font-bold">{formatMoney(cart.summary.total_minor, currency)}</span>
            <ShoppingBag aria-hidden className="size-5 opacity-80" />
          </button>
        </div>
      )}
    </div>
  )
}
