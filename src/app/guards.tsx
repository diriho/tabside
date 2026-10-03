import { Navigate, Outlet, useLocation } from 'react-router'
import { EmptyState, PageLoader } from '@/components/ui/Feedback'
import { ButtonLink } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { Store } from 'lucide-react'

/**
 * UX guards only. Authorization is enforced by RLS and RPC checks in the database —
 * these just route people to the right place.
 */
export function RequireStaff() {
  const { ready, isStaffAccount, membershipsLoading, memberships } = useAuth()
  const location = useLocation()
  if (!ready || membershipsLoading) return <PageLoader label="Signing you in" />
  if (!isStaffAccount) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (memberships.length === 0) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

export function RequireManager() {
  const { ready, isStaffAccount, membershipsLoading, memberships, active } = useAuth()
  const location = useLocation()
  if (!ready || membershipsLoading) return <PageLoader label="Signing you in" />
  if (!isStaffAccount) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (memberships.length === 0) return <Navigate to="/onboarding" replace />
  if (active?.role !== 'manager') {
    return (
      <main className="mx-auto max-w-md pt-16">
        <EmptyState
          icon={<Store />}
          title="Managers only"
          body={`You’re signed in as ${active?.role === 'kitchen' ? 'kitchen' : 'waitstaff'} at ${active?.restaurant.name}. The admin area is for managers.`}
          action={<ButtonLink to="/staff">Go to the service view</ButtonLink>}
        />
      </main>
    )
  }
  return <Outlet />
}
