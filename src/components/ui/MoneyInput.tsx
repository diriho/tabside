import { useEffect, useState } from 'react'
import { currencyExponent, currencySymbol, minorToInputString, parseMoneyToMinor } from '@shared/currency'
import { cn } from '@/lib/cn'

/**
 * Price input in the restaurant's currency. Edits a string and reports integer minor units
 * (or null while invalid) — no floating point anywhere.
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  id,
  className,
  ...aria
}: {
  value: number | null
  onChange: (minor: number | null) => void
  currency: string
  id?: string
  className?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-label'?: string
}) {
  const [text, setText] = useState(value === null ? '' : minorToInputString(value, currency))
  useEffect(() => {
    const parsed = parseMoneyToMinor(text, currency)
    if (parsed !== value) setText(value === null ? '' : minorToInputString(value, currency))
    // Only resync from props when the parsed value actually differs (keeps "12." while typing).
  }, [value, currency])
  const symbol = currencySymbol(currency)
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[15px] text-ink-3">{symbol}</span>
      <input
        id={id}
        {...aria}
        inputMode={currencyExponent(currency) === 0 ? 'numeric' : 'decimal'}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseMoneyToMinor(e.target.value, currency))
        }}
        placeholder={currencyExponent(currency) === 0 ? '0' : '0.00'}
        className="tnum h-11 w-full rounded-md border border-line-strong bg-surface pr-3.5 text-[16px] text-ink focus:border-clay focus:ring-3 focus:ring-clay/20 focus:outline-none"
        style={{ paddingLeft: `${Math.max(2, symbol.length) * 0.6 + 1.4}rem` }}
      />
    </div>
  )
}
