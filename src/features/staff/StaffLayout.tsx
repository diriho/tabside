import { ChefHat, LayoutDashboard, LayoutGrid, ListChecks, LogOut, Volume2, VolumeX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { ConnectionDot } from '@/components/layout/ConnectionDot'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { RestaurantSwitcher } from '@/components/layout/RestaurantSwitcher'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { IconButton } from '@/components/ui/Button'
import { useAuth, useStaffContext } from '@/hooks/useAuth'
import { useRealtimeInvalidate } from '@/hooks/useRealtime'
import { useToast } from '@/hooks/useToast'
import { playChime, unlockChime } from '@/lib/chime'
import { cn } from '@/lib/cn'
import { restaurantSubscriptions, staffKeys } from './staffKeys'

export default function StaffLayout() {
  const staff = useStaffContext()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const restaurantId = staff.restaurant.id
  const [sound, setSound] = useState(false)

  const subs = useMemo(() => restaurantSubscriptions(restaurantId), [restaurantId])
  const status = useRealtimeInvalidate(`staff:${restaurantId}`, subs, [staffKeys.all(restaurantId), staffKeys.menu(restaurantId)], (table, payload) => {
    if (table !== 'notifications' || payload.eventType !== 'INSERT') return
    const n = payload.new as { type: string; title: string; body: string | null; audience: string; recipient_roles: string[] | null }
    if (n.audience !== 'staff' || n.type === 'session.opened') return
    if (n.recipient_roles && staff.role !== 'manager' && !n.recipient_roles.includes(staff.role)) return
    if (n.type === 'order.new' && sound) playChime()
    toast.toast(n.title, { body: n.body ?? undefined, tone: n.type === 'order.cancelled' || n.type === 'item.unavailable' ? 'error' : 'info' })
  })

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-md">
        <div className="flex h-16 items-center gap-2 px-3 sm:px-5">
          <RestaurantSwitcher />
          <ConnectionDot status={status} className="ml-1" />
          <div className="flex-1" />
          <IconButton
            label={sound ? 'Mute new-order chime' : 'Play a chime for new orders'}
            onClick={() => {
              if (!sound) {
                unlockChime()
                playChime()
              }
              setSound(!sound)
            }}
          >
            {sound ? <Volume2 className="size-5 text-clay" /> : <VolumeX className="size-5" />}
          </IconButton>
          <NotificationBell restaurantId={restaurantId} />
          <ThemeToggle compact />
          <IconButton
            label="Sign out"
            onClick={async () => {
              await signOut()
              navigate('/login')
            }}
          >
            <LogOut className="size-5" />
          </IconButton>
        </div>
        <nav aria-label="Service" className="scrollbar-none flex gap-1 overflow-x-auto px-3 sm:px-5">
          <StaffTab to="/staff/orders" icon={<ChefHat />} label="Kitchen" />
          <StaffTab to="/staff/tables" icon={<LayoutGrid />} label="Tables" />
          <StaffTab to="/staff/menu" icon={<ListChecks />} label="Availability" />
          {staff.role === 'manager' && <StaffTab to="/admin" icon={<LayoutDashboard />} label="Admin" />}
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

function StaffTab({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'relative inline-flex h-12 shrink-0 items-center gap-2 px-3 text-[15px] font-semibold transition-colors [&_svg]:size-[18px]',
          isActive ? 'text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-clay' : 'text-ink-2 hover:text-ink',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
