import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet' | 'sage'
type Size = 'sm' | 'md' | 'lg' | 'xl'

const base =
  'inline-flex select-none items-center justify-center gap-2 font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform,box-shadow] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'

const variants: Record<Variant, string> = {
  primary: 'bg-clay text-on-clay shadow-soft hover:bg-clay-strong',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  quiet: 'text-ink-2 hover:text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90 [:root[data-theme=dark]_&]:text-bg',
  sage: 'bg-sage text-white hover:opacity-90',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 rounded-md px-3 text-sm',
  md: 'h-11 rounded-md px-4 text-[15px]',
  lg: 'h-12 rounded-lg px-5 text-base',
  xl: 'h-14 rounded-lg px-6 text-[17px]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, block, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="size-[1.1em] animate-spin" /> : icon}
      {children}
    </button>
  )
})

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  block,
  className,
  icon,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; block?: boolean; icon?: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], block && 'w-full', className)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}

export function IconButton({
  label,
  className,
  children,
  size = 'md',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink active:scale-95 disabled:opacity-40',
        size === 'sm' && 'size-9',
        size === 'md' && 'size-11',
        size === 'lg' && 'size-12',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
