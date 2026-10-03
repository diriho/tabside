import { Minus, Plus } from 'lucide-react'
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const control =
  'w-full rounded-md border border-line-strong bg-surface px-3.5 text-[16px] text-ink placeholder:text-ink-3 transition-colors focus:border-clay focus:outline-none focus:ring-3 focus:ring-clay/20 disabled:opacity-60 aria-[invalid=true]:border-danger'

export function Field({
  label,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode
  className?: string
  optional?: boolean
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-3">optional</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && <p id={hintId} className="text-[13px] text-ink-2">{hint}</p>}
      {error && <p id={errorId} className="text-[13px] font-medium text-danger">{error}</p>}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, 'h-11', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-24 py-2.5 leading-relaxed', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(control, 'h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23998473' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...rest}
    >
      {children}
    </select>
  )
})

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  size = 'md',
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  label: string
  size?: 'md' | 'lg'
}) {
  const btn = cn(
    'inline-flex items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition active:scale-90 disabled:opacity-35',
    size === 'lg' ? 'size-14' : 'size-10',
  )
  return (
    <div className="inline-flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label}`}>
        <Minus className={size === 'lg' ? 'size-6' : 'size-4'} />
      </button>
      <output aria-live="polite" className={cn('tnum min-w-[2ch] text-center font-bold', size === 'lg' ? 'display text-5xl' : 'text-lg')}>
        {value}
      </output>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}>
        <Plus className={size === 'lg' ? 'size-6' : 'size-4'} />
      </button>
    </div>
  )
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[15px] font-semibold">{label}</label>
        {description && <p className="text-sm text-ink-2">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-clay' : 'bg-line-strong',
        )}
      >
        <span className={cn('inline-block size-5.5 rounded-full bg-white shadow-soft transition-transform duration-200', checked ? 'translate-x-[23px]' : 'translate-x-[3px]')} />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: ReactNode }>
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-full border border-line bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors',
            value === o.value ? 'bg-surface text-ink shadow-soft' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
