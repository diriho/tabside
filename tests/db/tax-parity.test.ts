import { describe, expect, it } from 'vitest'
import { summarizeLines, type PricedLine, type TaxRule } from '../../shared/tax.ts'
import { admin, must } from './helpers.ts'

// Property-style check: for random carts, the TypeScript preview equals the SQL engine exactly.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const TAX_SETS: TaxRule[][] = [
  [],
  [{ tax_id: 't1', name: 'Sales', rate_bps: 1025, is_inclusive: false }],
  [{ tax_id: 'v', name: 'VAT', rate_bps: 1800, is_inclusive: true }],
  [
    { tax_id: 'v', name: 'VAT', rate_bps: 1600, is_inclusive: true },
    { tax_id: 'c', name: 'Catering levy', rate_bps: 200, is_inclusive: true },
  ],
  [
    { tax_id: 'v', name: 'VAT', rate_bps: 2000, is_inclusive: true },
    { tax_id: 's', name: 'Service', rate_bps: 1250, is_inclusive: false },
  ],
  [
    { tax_id: 't1', name: 'Sales', rate_bps: 887, is_inclusive: false },
    { tax_id: 't2', name: 'Liquor', rate_bps: 300, is_inclusive: false },
  ],
]

describe('tax engine parity (TypeScript ↔ SQL)', () => {
  it('agrees on 300 random carts', async () => {
    const random = rng(20261003)
    const carts: PricedLine[][] = Array.from({ length: 300 }, () =>
      Array.from({ length: 1 + Math.floor(random() * 6) }, () => {
        const unit = Math.floor(random() * 50_000) + 1
        const qty = 1 + Math.floor(random() * 5)
        return { line_total_minor: unit * qty, quantity: qty, taxes: TAX_SETS[Math.floor(random() * TAX_SETS.length)]! }
      }),
    )

    for (const cart of carts) {
      const sql = must(await admin.rpc('summarize_lines', { p_lines: cart as never }))
      expect(summarizeLines(cart)).toEqual(sql)
    }
  })
})
