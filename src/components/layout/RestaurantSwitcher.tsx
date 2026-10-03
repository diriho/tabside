import { ChevronsUpDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Monogram } from '@/components/ui/Display'
import { Sheet } from '@/components/ui/Sheet'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'

const ROLE_LABEL = { manager: 'Manager', kitchen: 'Kitchen', waiter: 'Waitstaff' } as const

export function RestaurantSwitcher({ className }: { className?: string }) {
  const { active, memberships, setActiveRestaurant } = useAuth()
  const [open, setOpen] = useState(false)
  if (!active) return null
  const multiple = memberships.length > 1
  const body = (
    <>
      <Monogram name={active.restaurant.name} src={active.restaurant.logo_url} className="size-9 text-sm" />
      <span className="min-w-0 text-left">
        <span className="block truncate text-[15px] font-bold leading-tight">{active.restaurant.name}</span>
        <span className="block text-[12.5px] text-ink-2">{active.display_name}, {ROLE_LABEL[active.role]}</span>
      </span>
      {multiple && <ChevronsUpDown className="size-4 shrink-0 text-ink-3" />}
    </>
  )
  return (
    <>
      {multiple ? (
        <button type="button" onClick={() => setOpen(true)} className={cn('flex min-w-0 items-center gap-2.5 rounded-lg p-1 pr-2 hover:bg-surface-2', className)}>
          {body}
        </button>
      ) : (
        <div className={cn('flex min-w-0 items-center gap-2.5 p-1', className)}>{body}</div>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Switch restaurant" size="sm">
        <ul className="space-y-1 pb-2">
          {memberships.map((m) => (
            <li key={m.restaurant.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveRestaurant(m.restaurant.id)
                  setOpen(false)
                }}
                className={cn('flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-surface-2', m.restaurant.id === active.restaurant.id && 'bg-surface-2')}
              >
                <Monogram name={m.restaurant.name} src={m.restaurant.logo_url} className="size-9 text-sm" />
                <span className="flex-1">
                  <span className="block font-semibold">{m.restaurant.name}</span>
                  <span className="block text-sm text-ink-2">{ROLE_LABEL[m.role]}</span>
                </span>
              </button>
            </li>
          ))}
          <li>
            <Link to="/onboarding" className="flex items-center gap-3 rounded-lg p-2 font-semibold text-clay hover:bg-surface-2">
              <span className="flex size-9 items-center justify-center rounded-full border border-dashed border-line-strong"><Plus className="size-4" /></span>
              Add a restaurant
            </Link>
          </li>
        </ul>
      </Sheet>
    </>
  )
}
