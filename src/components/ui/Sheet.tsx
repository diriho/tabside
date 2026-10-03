import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import { Field, Input } from './Form'

/**
 * Bottom sheet on phones, centered dialog from `sm` up. Traps focus, closes on Escape and
 * backdrop tap, locks page scroll, and restores focus to the opener.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideTitle,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  hideTitle?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const panel = panelRef.current
    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter(
        (el) => !el.hasAttribute('disabled'),
      )
    requestAnimationFrame(() => (panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel)?.focus())

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
      if (e.key === 'Tab') {
        const els = focusables()
        if (els.length === 0) return
        const first = els[0]!
        const last = els[els.length - 1]!
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-scrim" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full animate-sheet-in flex-col overflow-hidden rounded-t-xl bg-surface shadow-sheet outline-none sm:rounded-xl',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />
        <div className={cn('flex items-start gap-3 px-5 pt-4 pb-2 sm:px-6 sm:pt-6', hideTitle && 'sr-only')}>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-xl font-bold leading-tight">{title}</h2>
            {description && <div className="mt-1 text-[15px] text-ink-2">{description}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">{children}</div>
        {footer && <div className="safe-bottom border-t border-line bg-surface px-5 pt-3 pb-3 sm:px-6 sm:pb-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** Confirmation for destructive actions; optionally requires typing a phrase. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  requireText,
  tone = 'danger',
  loading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body: ReactNode
  confirmLabel: string
  requireText?: string
  tone?: 'danger' | 'primary'
  loading?: boolean
}) {
  const [typed, setTyped] = useState('')
  useEffect(() => {
    if (!open) setTyped('')
  }, [open])
  const blocked = Boolean(requireText) && typed.trim() !== requireText
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={blocked} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-[15px] text-ink-2">
        {body}
        {requireText && (
          <Field label={`Type “${requireText}” to confirm`}>
            {(p) => <Input {...p} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-autofocus />}
          </Field>
        )}
      </div>
    </Sheet>
  )
}
