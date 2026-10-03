// Converting between our ISO-4217 minor units and Stripe's amount convention.
// https://docs.stripe.com/currencies#zero-decimal and #special-cases
import { currencyExponent } from './currency.ts'

/** Currencies Stripe treats as zero-decimal (amount is in whole units). */
export const STRIPE_ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
])

export function toStripeAmount(minor: number, currency: string): number {
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new RangeError('Amount must be a positive integer')
  const code = currency.toUpperCase()
  const exponent = currencyExponent(code)
  if (STRIPE_ZERO_DECIMAL.has(code)) {
    if (exponent !== 0) throw new Error(`Unsupported exponent ${exponent} for zero-decimal ${code}`)
    return minor
  }
  // Stripe represents every other currency with 2 decimals (3-decimal ones with a trailing 0).
  if (exponent === 0) return minor * 100
  if (exponent === 2) return minor
  if (exponent === 3) {
    if (minor % 10 !== 0) throw new Error(`${code} amounts must be divisible by 10 for Stripe`)
    return minor
  }
  throw new Error(`Unsupported currency exponent ${exponent} for ${code}`)
}

export function fromStripeAmount(amount: number, currency: string): number {
  const code = currency.toUpperCase()
  const exponent = currencyExponent(code)
  if (STRIPE_ZERO_DECIMAL.has(code)) return amount
  if (exponent === 0) {
    if (amount % 100 !== 0) throw new Error(`Unexpected fractional ${code} amount from Stripe`)
    return amount / 100
  }
  return amount
}
