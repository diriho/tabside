import { Flame, Leaf, Plus, Sprout } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney } from '@shared/currency'
import { Photo } from '@/components/ui/Display'
import { cn } from '@/lib/cn'
import type { FullMenuItem, Menu } from '@/services/menu'

export function itemPriceLabel(item: FullMenuItem, currency: string): string {
  const variants = item.menu_item_variants.filter((v) => v.is_available)
  if (item.menu_item_variants.length > 0) {
    const prices = (variants.length ? variants : item.menu_item_variants).map((v) => v.price_minor)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    return min === max ? formatMoney(min, currency) : `from ${formatMoney(min, currency)}`
  }
  return formatMoney(item.price_minor, currency)
}

/** An item can be added in one tap when it needs no choices. */
export function needsChoices(item: FullMenuItem): boolean {
  return item.menu_item_variants.length > 0 || item.menu_modifier_groups.some((g) => g.min_select > 0)
}

const TAGS: Record<string, { icon: typeof Leaf; label: string }> = {
  vegetarian: { icon: Leaf, label: 'Vegetarian' },
  vegan: { icon: Sprout, label: 'Vegan' },
  spicy: { icon: Flame, label: 'Spicy' },
}

interface Section {
  id: string
  name: string
  description: string | null
  items: FullMenuItem[]
}

export function useMenuSections(menu: Menu | undefined): Section[] {
  return useMemo(() => {
    if (!menu) return []
    const active = menu.categories.filter((c) => c.is_active)
    const sections: Section[] = active.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      items: menu.items.filter((i) => i.category_id === c.id && i.availability !== 'hidden'),
    }))
    const uncategorized = menu.items.filter((i) => (!i.category_id || !active.some((c) => c.id === i.category_id)) && i.availability !== 'hidden' && !menu.categories.some((c) => c.id === i.category_id && !c.is_active))
    if (uncategorized.length) sections.push({ id: 'other', name: 'More', description: null, items: uncategorized })
    return sections.filter((s) => s.items.length > 0)
  }, [menu])
}

/** Sticky category chips with scroll-spy. */
export function CategoryNav({ sections, offset = 64 }: { sections: Section[]; offset?: number }) {
  const [active, setActive] = useState(sections[0]?.id)
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActive(visible.target.id.replace('cat-', ''))
      },
      { rootMargin: `-${offset + 56}px 0px -60% 0px` },
    )
    for (const s of sections) {
      const el = document.getElementById(`cat-${s.id}`)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections, offset])

  useEffect(() => {
    const chip = navRef.current?.querySelector<HTMLElement>(`[data-cat="${active}"]`)
    chip?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [active])

  if (sections.length < 2) return null
  return (
    <div ref={navRef} className="scrollbar-none sticky z-20 -mx-4 flex gap-2 overflow-x-auto border-b border-line/60 bg-bg/92 px-4 py-2.5 backdrop-blur-md" style={{ top: offset }}>
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#cat-${s.id}`}
          data-cat={s.id}
          onClick={(e) => {
            e.preventDefault()
            const el = document.getElementById(`cat-${s.id}`)
            if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset - 52, behavior: 'smooth' })
          }}
          aria-current={active === s.id ? 'true' : undefined}
          className={cn(
            'inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[14px] font-semibold transition-colors',
            active === s.id ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 hover:text-ink',
          )}
        >
          {s.name}
        </a>
      ))}
    </div>
  )
}

export function MenuSections({
  sections,
  currency,
  onSelect,
  onQuickAdd,
  readOnly,
  cartCounts,
}: {
  sections: Section[]
  currency: string
  onSelect?: (item: FullMenuItem) => void
  onQuickAdd?: (item: FullMenuItem) => void
  readOnly?: boolean
  cartCounts?: Map<string, number>
}) {
  return (
    <div className="space-y-9 pt-5">
      {sections.map((section) => (
        <section key={section.id} id={`cat-${section.id}`} aria-labelledby={`cat-h-${section.id}`} className="scroll-mt-32">
          <h2 id={`cat-h-${section.id}`} className="display text-[26px] font-extrabold">{section.name}</h2>
          {section.description && <p className="mt-0.5 text-[15px] text-ink-2">{section.description}</p>}
          <ul className="mt-3 divide-y divide-line">
            {section.items.map((item) => (
              <MenuRow
                key={item.id}
                item={item}
                currency={currency}
                readOnly={readOnly}
                inCart={cartCounts?.get(item.id) ?? 0}
                onSelect={onSelect}
                onQuickAdd={onQuickAdd}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function MenuRow({
  item,
  currency,
  readOnly,
  inCart,
  onSelect,
  onQuickAdd,
}: {
  item: FullMenuItem
  currency: string
  readOnly?: boolean
  inCart: number
  onSelect?: (item: FullMenuItem) => void
  onQuickAdd?: (item: FullMenuItem) => void
}) {
  const soldOut = item.availability !== 'available'
  const interactive = !readOnly && !soldOut
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <h3 className="text-[17px] font-bold leading-snug">
          {item.name}
          {inCart > 0 && (
            <span className="tnum ml-2 inline-flex h-5 min-w-5 -translate-y-px items-center justify-center rounded-full bg-clay px-1.5 align-middle text-[11.5px] font-bold text-on-clay">
              {inCart}
            </span>
          )}
        </h3>
        {item.description && <p className="mt-1 line-clamp-2 text-[14.5px] leading-snug text-ink-2">{item.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={cn('tnum text-[15px] font-bold', soldOut && 'text-ink-3 line-through decoration-1')}>{itemPriceLabel(item, currency)}</span>
          {soldOut && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-bold text-ink-2">Sold out</span>}
          {item.tags.filter((t) => TAGS[t]).map((t) => {
            const { icon: Icon, label } = TAGS[t]!
            return (
              <span key={t} className="inline-flex items-center gap-1 text-[12.5px] text-ink-2">
                <Icon aria-hidden className="size-3.5 text-sage" />
                {label}
              </span>
            )
          })}
        </div>
      </div>
      {item.image_url && (
        <Photo src={item.image_url} alt="" className={cn('size-24 shrink-0 rounded-lg', soldOut && 'opacity-50 grayscale')} />
      )}
    </>
  )

  return (
    <li className="relative">
      {interactive ? (
        <button type="button" onClick={() => onSelect?.(item)} className={cn('flex w-full gap-4 py-4 pr-1 text-left', !item.image_url && onQuickAdd && 'pr-14')}>
          {content}
        </button>
      ) : (
        <div className={cn('flex gap-4 py-4 pr-1', soldOut && 'opacity-80')}>{content}</div>
      )}
      {interactive && onQuickAdd && (
        <button
          type="button"
          onClick={() => (needsChoices(item) ? onSelect?.(item) : onQuickAdd(item))}
          aria-label={needsChoices(item) ? `Choose options for ${item.name}` : `Add ${item.name}`}
          className={cn(
            'absolute bottom-3 inline-flex size-10 items-center justify-center rounded-full bg-surface text-clay shadow-lift ring-1 ring-line transition-transform active:scale-90',
            item.image_url ? 'right-0' : 'right-1',
          )}
        >
          <Plus className="size-5" strokeWidth={2.5} />
        </button>
      )}
    </li>
  )
}
