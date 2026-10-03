import { Star } from 'lucide-react'
import { useState } from 'react'
import { formatMoney } from '@shared/currency'
import { cn } from '@/lib/cn'
import type { OrderStatus } from '@/types/domain'

export function Money({ minor, currency, className, signDisplay }: { minor: number; currency: string; className?: string; signDisplay?: 'auto' | 'always' | 'exceptZero' }) {
  return <span className={cn('tnum', className)}>{formatMoney(minor, currency, { signDisplay })}</span>
}

/**
 * The brass table number — TABSide's one bold element. It tells guests where they're seated
 * and lets staff spot a table at a glance.
 */
export function TableNumeral({ label, size = 'md', className, tone = 'brass' }: { label: string; size?: 'sm' | 'md' | 'lg' | 'hero'; className?: string; tone?: 'brass' | 'ink' | 'on-clay' }) {
  const long = label.length > 3
  return (
    <span
      aria-label={`Table ${label}`}
      className={cn(
        'display inline-flex items-center justify-center font-extrabold tnum',
        tone === 'brass' && 'text-brass',
        tone === 'ink' && 'text-ink',
        tone === 'on-clay' && 'text-on-clay',
        size === 'sm' && (long ? 'text-base' : 'text-2xl'),
        size === 'md' && (long ? 'text-xl' : 'text-4xl'),
        size === 'lg' && (long ? 'text-3xl' : 'text-6xl'),
        size === 'hero' && (long ? 'text-6xl' : 'text-[9rem] leading-[0.8]'),
        className,
      )}
    >
      {label}
    </span>
  )
}

/** A compact table badge for headers: brass numeral in a ring. */
export function TableBadge({ label, className }: { label: string; className?: string }) {
  const short = label.length <= 3
  return (
    <span
      aria-label={`Table ${label}`}
      className={cn('inline-flex h-10 items-center gap-2 rounded-full border border-brass/45 bg-brass-soft pl-3.5 text-brass-ink', short ? 'pr-1' : 'pr-3.5', className)}
    >
      <span aria-hidden className="text-[13px] font-semibold">{short ? 'Table' : label}</span>
      {short && (
        <span aria-hidden className="display inline-flex size-8 items-center justify-center rounded-full bg-surface text-[17px] font-extrabold text-brass-ink tnum">
          {label}
        </span>
      )}
    </span>
  )
}

export function Stars({ value, size = 'md', className }: { value: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const px = size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-6' : 'size-4.5'
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)))
        return (
          <span key={i} className={cn('relative inline-block', px)}>
            <Star aria-hidden className={cn('absolute inset-0 text-line-strong', px)} fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star aria-hidden className={cn('text-brass', px)} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        )
      })}
    </span>
  )
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  const labels = ['Poor', 'Fair', 'Good', 'Great', 'Excellent']
  const shown = hover || value
  return (
    <div className="flex flex-col items-center gap-2">
      <div role="radiogroup" aria-label="Rating" className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} star${i > 1 ? 's' : ''} — ${labels[i - 1]}`}
            onClick={() => onChange(i)}
            onMouseEnter={() => setHover(i)}
            className="rounded-full p-1.5 transition-transform active:scale-90"
          >
            <Star className={cn('size-10 transition-colors', i <= shown ? 'text-brass' : 'text-line-strong')} fill="currentColor" strokeWidth={0} />
          </button>
        ))}
      </div>
      <p className="h-5 text-sm font-semibold text-ink-2" aria-live="polite">{shown ? labels[shown - 1] : ''}</p>
    </div>
  )
}

const STATUS: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: 'New', className: 'bg-brass-soft text-brass-ink' },
  accepted: { label: 'Accepted', className: 'bg-clay-soft text-clay' },
  preparing: { label: 'Preparing', className: 'bg-clay text-on-clay' },
  ready: { label: 'Ready', className: 'bg-sage text-white [:root[data-theme=dark]_&]:text-bg' },
  delivered: { label: 'Delivered', className: 'bg-surface-2 text-ink-2' },
  cancelled: { label: 'Cancelled', className: 'bg-danger-soft text-danger' },
}

export function StatusPill({ status, className, guestFacing }: { status: OrderStatus; className?: string; guestFacing?: boolean }) {
  const s = STATUS[status]
  const label = guestFacing && status === 'pending' ? 'Sent' : s.label
  return <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-[12.5px] font-bold', s.className, className)}>{label}</span>
}

export function Monogram({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(/\s+/).filter((w) => !/^(the|le|la|café)$/i.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || name[0]
  if (src && !failed) {
    return <img src={src} alt="" onError={() => setFailed(true)} className={cn('rounded-full object-cover', className)} />
  }
  return (
    <span aria-hidden className={cn('display inline-flex items-center justify-center rounded-full bg-clay font-extrabold text-on-clay', className)}>
      {initials}
    </span>
  )
}

/** Image with a warm placeholder and graceful failure. */
export function Photo({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(src ? 'loading' : 'failed')
  return (
    <span className={cn('relative block overflow-hidden bg-surface-2', className)}>
      {src && state !== 'failed' && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
          className={cn('size-full object-cover transition-opacity duration-300', state === 'loaded' ? 'opacity-100' : 'opacity-0')}
        />
      )}
    </span>
  )
}
