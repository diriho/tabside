import { CircleAlert, Loader2, RefreshCw, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { toAppError } from '@/lib/errors'
import { Button } from './Button'

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-ink-2', className)}>
      <Loader2 aria-hidden className="size-5 animate-spin" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-2', className)} />
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-ink-2">
      <Loader2 aria-hidden className="size-6 animate-spin text-clay" />
      <p className="text-sm">{label}…</p>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  body?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-6">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-[15px] text-ink-2">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({
  error,
  title,
  onRetry,
  action,
  className,
}: {
  error?: unknown
  title?: string
  onRetry?: () => void
  action?: ReactNode
  className?: string
}) {
  const appError = error ? toAppError(error) : null
  const offline = appError?.code === 'network'
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
        {offline ? <WifiOff className="size-6" /> : <CircleAlert className="size-6" />}
      </div>
      <h3 className="text-lg font-bold">{title ?? (offline ? 'You’re offline' : 'This didn’t load')}</h3>
      {appError && <p className="mt-1 max-w-sm text-[15px] text-ink-2">{appError.message}</p>}
      <div className="mt-5 flex gap-2">
        {onRetry && (
          <Button variant="secondary" onClick={onRetry} icon={<RefreshCw className="size-4" />}>
            Try again
          </Button>
        )}
        {action}
      </div>
    </div>
  )
}

export function InlineAlert({ tone = 'info', children, className }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'rounded-md px-3.5 py-3 text-[14px] leading-snug',
        tone === 'info' && 'bg-surface-2 text-ink',
        tone === 'warning' && 'bg-brass-soft text-ink',
        tone === 'danger' && 'bg-danger-soft text-ink',
        tone === 'success' && 'bg-sage-soft text-ink',
        className,
      )}
    >
      {children}
    </div>
  )
}
