import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  tone: Tone
  title: string
  body?: string
}

interface ToastApi {
  toast: (title: string, opts?: { tone?: Tone; body?: string; duration?: number }) => void
  success: (title: string, body?: string) => void
  error: (title: string, body?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback<ToastApi['toast']>(
    (title, opts = {}) => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-2), { id, title, tone: opts.tone ?? 'info', body: opts.body }])
      setTimeout(() => dismiss(id), opts.duration ?? (opts.tone === 'error' ? 6000 : 3800))
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, body) => toast(title, { tone: 'success', body }),
      error: (title, body) => toast(title, { tone: 'error', body }),
    }),
    [toast],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),12px)]"
      >
        {toasts.map((t) => {
          const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? CircleAlert : Info
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full max-w-sm animate-sheet-in items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-lift"
            >
              <Icon
                aria-hidden
                className={cn('mt-0.5 size-5 shrink-0', t.tone === 'success' && 'text-sage', t.tone === 'error' && 'text-danger', t.tone === 'info' && 'text-clay')}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-snug">{t.title}</p>
                {t.body && <p className="mt-0.5 text-sm text-ink-2">{t.body}</p>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="-m-1 rounded p-1 text-ink-3 hover:text-ink" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
