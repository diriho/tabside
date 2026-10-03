// Currency helpers. Amounts are always integer minor units (e.g. USD 12.50 → 1250, BIF 12000 → 12000).
// The exponent table mirrors public.currencies in the database (ISO 4217).

export const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, CHF: 2, JPY: 0, INR: 2, AED: 2, MXN: 2, BRL: 2, ZAR: 2,
  NGN: 2, GHS: 2, KES: 2, TZS: 2, UGX: 0, RWF: 0, BIF: 0, ETB: 2, XOF: 0, XAF: 0,
}

export function currencyExponent(currency: string): number {
  const code = currency.toUpperCase()
  const known = CURRENCY_EXPONENTS[code]
  if (known !== undefined) return known
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions()
      .maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

export function formatMoney(
  minor: number,
  currency: string,
  options: { locale?: string; signDisplay?: 'auto' | 'always' | 'exceptZero' } = {},
): string {
  const exponent = currencyExponent(currency)
  // Display only: dividing here is safe because the value is never fed back into arithmetic.
  const major = minor / 10 ** exponent
  return new Intl.NumberFormat(options.locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
    signDisplay: options.signDisplay ?? 'auto',
  }).format(major)
}

/**
 * Parses a human-entered amount ("12.5", "1,200", "12000") into minor units without
 * floating-point arithmetic. Returns null for invalid input or too many decimals.
 */
export function parseMoneyToMinor(input: string, currency: string): number | null {
  const exponent = currencyExponent(currency)
  const cleaned = input.trim().replace(/[\s,_]/g, '')
  if (cleaned === '') return null
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned)
  if (!match) return null
  const whole = match[1] ?? '0'
  const fraction = match[2] ?? ''
  if (fraction.length > exponent) return null
  const minorString = whole + fraction.padEnd(exponent, '0')
  const value = Number(minorString)
  if (!Number.isSafeInteger(value)) return null
  return value
}

/** Formats minor units as a plain decimal string for inputs ("12.50", "12000"). */
export function minorToInputString(minor: number, currency: string): string {
  const exponent = currencyExponent(currency)
  if (exponent === 0) return String(minor)
  const negative = minor < 0
  const digits = String(Math.abs(minor)).padStart(exponent + 1, '0')
  const whole = digits.slice(0, -exponent)
  const fraction = digits.slice(-exponent)
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

export function currencySymbol(currency: string, locale?: string): string {
  const part = new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() })
    .formatToParts(0)
    .find((p) => p.type === 'currency')
  return part?.value ?? currency.toUpperCase()
}

/** Short axis/tick form: "$1.2K", "BIF 45K". */
export function formatCompactMoney(minor: number, currency: string, locale?: string): string {
  const major = minor / 10 ** currencyExponent(currency)
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase(), notation: 'compact', maximumFractionDigits: 1 }).format(major)
}
