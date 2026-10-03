// Tax engine — an exact mirror of public.calc_line_taxes / public.summarize_lines in
// supabase/migrations/…_business_logic.sql. The database is authoritative; this copy powers
// instant cart previews and is parity-tested against the SQL implementation.

export interface TaxRule {
  tax_id: string | null
  name: string
  /** basis points: 16% = 1600, 7.25% = 725 */
  rate_bps: number
  is_inclusive: boolean
}

export interface TaxAmount extends TaxRule {
  amount_minor: number
}

export interface PricedLine {
  line_total_minor: number
  quantity: number
  taxes: TaxRule[]
}

export interface OrderSummary {
  subtotal_minor: number
  item_count: number
  inclusive_tax_minor: number
  exclusive_tax_minor: number
  total_minor: number
  taxes: TaxAmount[]
}

/** Half-up integer division for non-negative integers (exact, via BigInt). */
export function divRound(n: number, d: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || n < 0 || d <= 0) {
    throw new RangeError(`divRound expects non-negative safe integers, got ${n}/${d}`)
  }
  const bn = BigInt(n)
  const bd = BigInt(d)
  return Number((2n * bn + bd) / (2n * bd))
}

export function calcLineTaxes(lineTotalMinor: number, taxes: readonly TaxRule[]) {
  const inclusive = taxes.filter((t) => t.is_inclusive)
  const inclusiveRate = inclusive.reduce((sum, t) => sum + t.rate_bps, 0)
  const net = inclusiveRate === 0 ? lineTotalMinor : divRound(lineTotalMinor * 10000, 10000 + inclusiveRate)
  const inclusiveTotal = lineTotalMinor - net

  let allocated = 0
  let inclusiveSeen = 0
  const amounts: TaxAmount[] = taxes.map((tax) => {
    let amount: number
    if (tax.is_inclusive) {
      inclusiveSeen += 1
      if (inclusiveSeen === inclusive.length) {
        // last inclusive tax absorbs the rounding remainder so shares sum to (line - net)
        amount = Math.max(inclusiveTotal - allocated, 0)
      } else {
        amount = divRound(net * tax.rate_bps, 10000)
        allocated += amount
      }
    } else {
      amount = divRound(net * tax.rate_bps, 10000)
    }
    return { ...tax, amount_minor: amount }
  })

  return { net_minor: net, taxes: amounts }
}

export function summarizeLines(lines: readonly PricedLine[]): OrderSummary {
  let subtotal = 0
  let items = 0
  const byKey = new Map<string, TaxAmount>()

  for (const line of lines) {
    subtotal += line.line_total_minor
    items += line.quantity
    for (const tax of calcLineTaxes(line.line_total_minor, line.taxes).taxes) {
      const key = `${tax.tax_id ?? ''}|${tax.name}|${tax.rate_bps}|${tax.is_inclusive}`
      const existing = byKey.get(key)
      if (existing) existing.amount_minor += tax.amount_minor
      else byKey.set(key, { ...tax })
    }
  }

  const taxes = [...byKey.values()]
  const inclusive = taxes.filter((t) => t.is_inclusive).reduce((s, t) => s + t.amount_minor, 0)
  const exclusive = taxes.filter((t) => !t.is_inclusive).reduce((s, t) => s + t.amount_minor, 0)

  return {
    subtotal_minor: subtotal,
    item_count: items,
    inclusive_tax_minor: inclusive,
    exclusive_tax_minor: exclusive,
    total_minor: subtotal + exclusive,
    taxes,
  }
}

export interface TaxDefinition {
  id: string
  name: string
  rate_bps: number
  is_inclusive: boolean
  scope: 'all' | 'categories' | 'items'
  is_active: boolean
  sort_order: number
  created_at: string
}

/** Mirror of public._item_taxes: which active taxes apply to an item, in deterministic order. */
export function applicableTaxes(
  taxes: readonly TaxDefinition[],
  links: { taxCategories: ReadonlyArray<{ tax_id: string; category_id: string }>; taxItems: ReadonlyArray<{ tax_id: string; item_id: string }> },
  item: { id: string; category_id: string | null },
): TaxRule[] {
  return taxes
    .filter((t) => t.is_active && t.rate_bps > 0)
    .filter((t) => {
      if (t.scope === 'all') return true
      if (t.scope === 'categories') {
        return item.category_id !== null &&
          links.taxCategories.some((l) => l.tax_id === t.id && l.category_id === item.category_id)
      }
      return links.taxItems.some((l) => l.tax_id === t.id && l.item_id === item.id)
    })
    .sort((a, b) =>
      a.sort_order - b.sort_order ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id))
    .map((t) => ({ tax_id: t.id, name: t.name, rate_bps: t.rate_bps, is_inclusive: t.is_inclusive }))
}

export function formatRate(rateBps: number): string {
  const percent = rateBps / 100
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0$/, '')}%`
}
