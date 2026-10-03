import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="display text-[32px] font-extrabold">{title}</h1>
        {description && <p className="mt-1 max-w-[65ch] text-[15px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ title, description, children, actions, className }: { title?: string; description?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface p-5 sm:p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-bold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}
