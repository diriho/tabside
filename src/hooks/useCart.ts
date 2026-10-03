import { useCallback, useEffect, useMemo, useState } from 'react'
import { applicableTaxes, summarizeLines, type OrderSummary } from '@shared/tax'
import type { FullMenuItem, Menu } from '@/services/menu'

export interface CartLine {
  key: string
  itemId: string
  variantId: string | null
  modifierIds: string[]
  quantity: number
  notes: string
}

export interface PricedCartLine extends CartLine {
  item: FullMenuItem | undefined
  name: string
  detail: string
  unitPriceMinor: number
  lineTotalMinor: number
  /** Why this line can't be ordered right now (sold out, removed from the menu…) */
  problem: string | null
}

const storageKey = (sessionId: string) => `tabside-cart:${sessionId}`

function read(sessionId: string): CartLine[] {
  try {
    const raw = localStorage.getItem(storageKey(sessionId))
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(sessionId: string, lines: CartLine[]) {
  try {
    if (lines.length === 0) localStorage.removeItem(storageKey(sessionId))
    else localStorage.setItem(storageKey(sessionId), JSON.stringify(lines))
  } catch {
    /* storage unavailable (private mode) — the cart still works in memory */
  }
}

export function lineKey(itemId: string, variantId: string | null, modifierIds: string[], notes: string): string {
  return [itemId, variantId ?? '', [...modifierIds].sort().join(','), notes.trim()].join('|')
}

const listeners = new Set<() => void>()

/** Cart for one table session, persisted per phone so a refresh never loses it. */
export function useCart(sessionId: string, menu: Menu | undefined) {
  const [lines, setLines] = useState<CartLine[]>(() => read(sessionId))

  useEffect(() => {
    setLines(read(sessionId))
    const sync = () => setLines(read(sessionId))
    listeners.add(sync)
    return () => {
      listeners.delete(sync)
    }
  }, [sessionId])

  const commit = useCallback(
    (next: CartLine[]) => {
      write(sessionId, next)
      for (const l of listeners) l()
    },
    [sessionId],
  )

  const add = useCallback(
    (line: Omit<CartLine, 'key'>) => {
      const key = lineKey(line.itemId, line.variantId, line.modifierIds, line.notes)
      const current = read(sessionId)
      const existing = current.find((l) => l.key === key)
      commit(
        existing
          ? current.map((l) => (l.key === key ? { ...l, quantity: Math.min(99, l.quantity + line.quantity) } : l))
          : [...current, { ...line, key }],
      )
    },
    [sessionId, commit],
  )

  const setQuantity = useCallback(
    (key: string, quantity: number) => {
      const current = read(sessionId)
      commit(quantity <= 0 ? current.filter((l) => l.key !== key) : current.map((l) => (l.key === key ? { ...l, quantity: Math.min(99, quantity) } : l)))
    },
    [sessionId, commit],
  )

  const remove = useCallback((key: string) => commit(read(sessionId).filter((l) => l.key !== key)), [sessionId, commit])
  const clear = useCallback(() => commit([]), [commit])

  const priced = useMemo(() => priceCart(lines, menu), [lines, menu])

  return { lines, priced: priced.lines, summary: priced.summary, hasProblems: priced.lines.some((l) => l.problem), add, setQuantity, remove, clear }
}

/** Client-side preview pricing. The database re-prices everything when the order is placed. */
export function priceCart(lines: CartLine[], menu: Menu | undefined): { lines: PricedCartLine[]; summary: OrderSummary } {
  const priced: PricedCartLine[] = lines.map((line) => {
    const item = menu?.items.find((i) => i.id === line.itemId)
    if (!item) {
      return { ...line, item, name: 'Unavailable item', detail: '', unitPriceMinor: 0, lineTotalMinor: 0, problem: menu ? 'No longer on the menu' : null }
    }
    const variant = item.menu_item_variants.find((v) => v.id === line.variantId) ?? null
    const modifiers = item.menu_modifier_groups.flatMap((g) => g.menu_modifiers).filter((m) => line.modifierIds.includes(m.id))
    const base = variant ? variant.price_minor : item.price_minor
    const unit = base + modifiers.reduce((s, m) => s + m.price_delta_minor, 0)
    const category = menu?.categories.find((c) => c.id === item.category_id)
    let problem: string | null = null
    if (item.availability !== 'available' || (category && !category.is_active)) problem = 'Sold out'
    else if (variant && !variant.is_available) problem = `${variant.name} sold out`
    else if (modifiers.length !== line.modifierIds.length || modifiers.some((m) => !m.is_available)) problem = 'An extra is unavailable'

    const detail = [variant?.name, ...modifiers.map((m) => m.name), line.notes ? `“${line.notes}”` : null].filter(Boolean).join(', ')
    return { ...line, item, name: item.name, detail, unitPriceMinor: unit, lineTotalMinor: unit * line.quantity, problem }
  })

  const summary = summarizeLines(
    priced
      .filter((l) => l.item && !l.problem)
      .map((l) => ({
        line_total_minor: l.lineTotalMinor,
        quantity: l.quantity,
        taxes: menu ? applicableTaxes(menu.taxes, menu, { id: l.itemId, category_id: l.item!.category_id }) : [],
      })),
  )
  return { lines: priced, summary }
}
