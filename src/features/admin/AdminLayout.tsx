import {
  BarChart3, ChefHat, ClipboardList, LayoutDashboard, LogOut, Menu as MenuIcon, MessageSquareQuote, QrCode, Settings, Users, UtensilsCrossed, X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { ConnectionDot } from '@/components/layout/ConnectionDot'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { RestaurantSwitcher } from '@/components/layout/RestaurantSwitcher'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { IconButton } from '@/components/ui/Button'
import { useAuth, useStaffContext } from '@/hooks/useAuth'
import { useRealtimeInvalidate } from '@/hooks/useRealtime'
import { cn } from '@/lib/cn'
import { restaurantSubscriptions, staffKeys } from '@/features/staff/staffKeys'

const NAV = [
  { to: '/admin', end: true, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/orders', icon: ClipboardList, label: 'Orders' },
  { to: '/admin/menu', icon: UtensilsCrossed, label: 'Menu & taxes' },
  { to: '/admin/tables', icon: QrCode, label: 'Tables & QR codes' },
  { to: '/admin/staff', icon: Users, label: 'Staff' },
  { to: '/admin/reviews', icon: MessageSquareQuote, label: 'Reviews' },
  { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/admin/restaurant', icon: Settings, label: 'Restaurant' },
]

export default function AdminLayout() {
  const staff = useStaffContext()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  const restaurantId = staff.restaurant.id
  const subs = useMemo(() => restaurantSubscriptions(restaurantId), [restaurantId])
  const status = useRealtimeInvalidate(`admin:${restaurantId}`, subs, [staffKeys.all(restaurantId), staffKeys.menu(restaurantId), ['admin', restaurantId]])

  useEffect(() => setDrawer(false), [location.pathname])

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-0.5">
      {NAV.map(({ to, end, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex h-11 items-center gap-3 rounded-md px-3 text-[15px] font-semibold transition-colors',
              isActive ? 'bg-clay-soft text-clay' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )
          }
        >
          <Icon className="size-[18px]" />
          {label}
        </NavLink>
      ))}
      <div className="my-3 border-t border-line" />
      <Link to="/staff/orders" className="flex h-11 items-center gap-3 rounded-md px-3 text-[15px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink">
        <ChefHat className="size-[18px]" /> Service view
      </Link>
      <Link to={`/r/${staff.restaurant.slug}`} target="_blank" className="flex h-11 items-center gap-3 rounded-md px-3 text-[15px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink">
        <UtensilsCrossed className="size-[18px]" /> Public page
      </Link>
    </nav>
  )

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface p-4 lg:flex">
        <RestaurantSwitcher className="mb-5" />
        {nav}
        <div className="mt-auto flex items-center justify-between">
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
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-bg/90 px-3 backdrop-blur-md sm:px-6">
          <IconButton label="Open navigation" className="lg:hidden" onClick={() => setDrawer(true)}>
            <MenuIcon className="size-5" />
          </IconButton>
          <span className="truncate font-bold lg:hidden">{staff.restaurant.name}</span>
          <ConnectionDot status={status} className="ml-1" />
          <div className="flex-1" />
          <NotificationBell restaurantId={restaurantId} />
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-scrim" onClick={() => setDrawer(false)} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label="Navigation" className="absolute inset-y-0 left-0 flex w-72 animate-fade-in flex-col bg-surface p-4 shadow-lift">
            <div className="mb-4 flex items-center justify-between">
              <RestaurantSwitcher />
              <IconButton label="Close navigation" onClick={() => setDrawer(false)}><X className="size-5" /></IconButton>
            </div>
            {nav}
            <div className="mt-auto flex items-center justify-between">
              <ThemeToggle compact />
              <IconButton label="Sign out" onClick={async () => { await signOut(); navigate('/login') }}><LogOut className="size-5" /></IconButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
