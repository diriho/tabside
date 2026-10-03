import { cn } from '@/lib/cn'
import type { RealtimeStatus } from '@/hooks/useRealtime'

export function ConnectionDot({ status, className }: { status: RealtimeStatus; className?: string }) {
  const label = status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline — reconnecting'
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] font-semibold', status === 'offline' ? 'text-danger' : 'text-ink-2', className)} title={label}>
      <span className={cn('size-2 rounded-full', status === 'live' && 'bg-sage', status === 'connecting' && 'animate-pulse bg-brass', status === 'offline' && 'bg-danger')} />
      <span className={cn(status === 'live' && 'sr-only sm:not-sr-only')}>{label}</span>
    </span>
  )
}
