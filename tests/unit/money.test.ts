import { describe, expect, it } from 'vitest'
import { currencyExponent, formatMoney, minorToInputString, parseMoneyToMinor } from '../../shared/currency.ts'
import { fromStripeAmount, toStripeAmount } from '../../shared/stripe-amount.ts'
import { applicableTaxes, calcLineTaxes, divRound, formatRate, summarizeLines, type TaxDefinition } from '../../shared/tax.ts'

describe('currency', () => {
  it('knows minor-unit exponents, including zero-decimal currencies', () => {
    expect(currencyExponent('USD')).toBe(2)
    expect(currencyExponent('KES')).toBe(2)
    expect(currencyExponent('BIF')).toBe(0)
    expect(currencyExponent('jpy')).toBe(0)
    expect(currencyExponent('BHD')).toBe(3) // not in our table: falls back to Intl
  })

  it('formats integer minor units without assuming USD', () => {
    expect(formatMoney(1250, 'USD', { locale: 'en-US' })).toBe('$12.50')
    expect(formatMoney(1250, 'EUR', { locale: 'de-DE' })).toBe('12,50 €')
    expect(formatMoney(12000, 'BIF', { locale: 'en-US' })).toBe('BIF 12,000')
    expect(formatMoney(99, 'GBP', { locale: 'en-GB' })).toBe('£0.99')
  })

  it('parses human input to minor units without floating point error', () => {
    expect(parseMoneyToMinor('12.5', 'USD')).toBe(1250)
    expect(parseMoneyToMinor('0.10', 'USD')).toBe(10)
    expect(parseMoneyToMinor('1,234.56', 'USD')).toBe(123456)
    expect(parseMoneyToMinor('19.99', 'USD')).toBe(1999) // 19.99 * 100 = 1998.9999… in floats
    expect(parseMoneyToMinor('12000', 'BIF')).toBe(12000)
    expect(parseMoneyToMinor('12.5', 'BIF')).toBeNull() // BIF has no minor unit
    expect(parseMoneyToMinor('1.234', 'USD')).toBeNull()
    expect(parseMoneyToMinor('abc', 'USD')).toBeNull()
    expect(parseMoneyToMinor('-5', 'USD')).toBeNull()
    expect(parseMoneyToMinor('', 'USD')).toBeNull()
  })

  it('round-trips minor units through the input format', () => {
    for (const [minor, cur] of [[0, 'USD'], [5, 'USD'], [1250, 'USD'], [123456, 'EUR'], [12000, 'BIF']] as const) {
      expect(parseMoneyToMinor(minorToInputString(minor, cur), cur)).toBe(minor)
    }
    expect(minorToInputString(5, 'USD')).toBe('0.05')
  })
})

describe('tax engine', () => {
  const sales = { tax_id: 's', name: 'Sales tax', rate_bps: 1025, is_inclusive: false }
  const vat = { tax_id: 'v', name: 'VAT', rate_bps: 1800, is_inclusive: true }

  it('rounds half up with exact integer math', () => {
    expect(divRound(5, 10)).toBe(1)
    expect(divRound(4, 10)).toBe(0)
    expect(divRound(15, 10)).toBe(2)
    expect(divRound(0, 7)).toBe(0)
    expect(() => divRound(-1, 2)).toThrow()
  })

  it('adds exclusive tax on top', () => {
    const { net_minor, taxes } = calcLineTaxes(1400, [sales])
    expect(net_minor).toBe(1400)
    expect(taxes[0]!.amount_minor).toBe(144) // 14.35 → 144 (half up of 143.5)
  })

  it('extracts inclusive tax from the price', () => {
    const { net_minor, taxes } = calcLineTaxes(1180, [vat])
    expect(net_minor).toBe(1000)
    expect(taxes[0]!.amount_minor).toBe(180)
  })

  it('splits multiple inclusive taxes so they sum exactly to the included amount', () => {
    const line = 999
    const r = calcLineTaxes(line, [
      { tax_id: 'a', name: 'VAT', rate_bps: 1600, is_inclusive: true },
      { tax_id: 'b', name: 'Levy', rate_bps: 200, is_inclusive: true },
    ])
    const included = r.taxes.reduce((s, t) => s + t.amount_minor, 0)
    expect(r.net_minor + included).toBe(line)
  })

  it('summarizes a cart: subtotal, tax and total', () => {
    const s = summarizeLines([
      { line_total_minor: 2800, quantity: 2, taxes: [sales] },
      { line_total_minor: 800, quantity: 1, taxes: [sales, { tax_id: 'l', name: 'Liquor tax', rate_bps: 300, is_inclusive: false }] },
    ])
    expect(s.subtotal_minor).toBe(3600)
    expect(s.item_count).toBe(3)
    expect(s.taxes.map((t) => [t.name, t.amount_minor])).toEqual([['Sales tax', 287 + 82], ['Liquor tax', 24]])
    expect(s.exclusive_tax_minor).toBe(393)
    expect(s.inclusive_tax_minor).toBe(0)
    expect(s.total_minor).toBe(3993)
  })

  it('does not add inclusive tax to the total', () => {
    const s = summarizeLines([{ line_total_minor: 12000, quantity: 1, taxes: [vat] }])
    expect(s.total_minor).toBe(12000)
    expect(s.inclusive_tax_minor).toBe(1831)
  })

  it('applies taxes by scope in a deterministic order', () => {
    const defs: TaxDefinition[] = [
      { id: 't2', name: 'Liquor', rate_bps: 300, is_inclusive: false, scope: 'items', is_active: true, sort_order: 2, created_at: '2026-01-01' },
      { id: 't1', name: 'Sales', rate_bps: 1025, is_inclusive: false, scope: 'all', is_active: true, sort_order: 1, created_at: '2026-01-01' },
      { id: 't3', name: 'Dessert levy', rate_bps: 100, is_inclusive: false, scope: 'categories', is_active: true, sort_order: 3, created_at: '2026-01-01' },
      { id: 't4', name: 'Old', rate_bps: 500, is_inclusive: false, scope: 'all', is_active: false, sort_order: 0, created_at: '2026-01-01' },
    ]
    const links = { taxCategories: [{ tax_id: 't3', category_id: 'desserts' }], taxItems: [{ tax_id: 't2', item_id: 'beer' }] }
    expect(applicableTaxes(defs, links, { id: 'beer', category_id: 'drinks' }).map((t) => t.name)).toEqual(['Sales', 'Liquor'])
    expect(applicableTaxes(defs, links, { id: 'cake', category_id: 'desserts' }).map((t) => t.name)).toEqual(['Sales', 'Dessert levy'])
    expect(applicableTaxes(defs, links, { id: 'x', category_id: null }).map((t) => t.name)).toEqual(['Sales'])
  })

  it('formats rates', () => {
    expect(formatRate(1600)).toBe('16%')
    expect(formatRate(1025)).toBe('10.25%')
    expect(formatRate(750)).toBe('7.5%')
  })
})

describe('stripe amounts', () => {
  it('passes two-decimal currencies through', () => {
    expect(toStripeAmount(4820, 'USD')).toBe(4820)
    expect(fromStripeAmount(4820, 'usd')).toBe(4820)
  })
  it('keeps zero-decimal currencies in whole units', () => {
    expect(toStripeAmount(12000, 'BIF')).toBe(12000)
    expect(fromStripeAmount(12000, 'bif')).toBe(12000)
  })
  it('rejects non-positive or fractional amounts', () => {
    expect(() => toStripeAmount(0, 'USD')).toThrow()
    expect(() => toStripeAmount(10.5, 'USD')).toThrow()
  })
})
