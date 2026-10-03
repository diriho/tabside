import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
        <Link to="/" className="display text-xl font-extrabold">TAB<span className="text-clay">Side</span></Link>
        <ThemeToggle compact />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-16">
        <h1 className="display text-[34px] font-extrabold">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[16px] text-ink-2">{subtitle}</p>}
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-6 text-center text-[15px] text-ink-2">{footer}</div>}
      </main>
    </div>
  )
}
