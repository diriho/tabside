import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { unwrap } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { StaffRole } from '@/types/domain'

export interface Membership {
  id: string
  role: StaffRole
  display_name: string
  is_owner: boolean
  restaurant: { id: string; slug: string; name: string; currency: string; timezone: string; status: string; logo_url: string | null; deleted_at: string | null }
}

interface AuthState {
  session: Session | null
  ready: boolean
  isStaffAccount: boolean
  memberships: Membership[]
  membershipsLoading: boolean
  active: Membership | null
  setActiveRestaurant: (restaurantId: string) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)
const ACTIVE_KEY = 'tabside-active-restaurant'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY)
    } catch {
      return null
    }
  })

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const isStaffAccount = Boolean(session && !session.user.is_anonymous)

  const memberships = useQuery({
    queryKey: ['memberships', userId],
    enabled: isStaffAccount,
    queryFn: async (): Promise<Membership[]> => {
      const rows = unwrap(
        await supabase
          .from('staff_members')
          .select('id, role, display_name, is_owner, restaurant:restaurants(id, slug, name, currency, timezone, status, logo_url, deleted_at)')
          .eq('user_id', userId!)
          .eq('is_active', true),
      ) as unknown as Membership[]
      return rows.filter((m) => m.restaurant && !m.restaurant.deleted_at)
    },
  })

  const list = memberships.data ?? []
  const active = list.find((m) => m.restaurant.id === activeId) ?? list[0] ?? null

  const value = useMemo<AuthState>(
    () => ({
      session,
      ready,
      isStaffAccount,
      memberships: list,
      membershipsLoading: isStaffAccount && memberships.isPending,
      active,
      setActiveRestaurant: (id) => {
        setActiveId(id)
        try {
          localStorage.setItem(ACTIVE_KEY, id)
        } catch {
          /* ignore */
        }
      },
      signOut: async () => {
        await supabase.auth.signOut()
        queryClient.clear()
      },
    }),
    [session, ready, isStaffAccount, list, memberships.isPending, active, queryClient],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** The restaurant the signed-in staff member is working in (guards guarantee it exists). */
export function useStaffContext(): Membership {
  const { active } = useAuth()
  if (!active) throw new Error('No active restaurant')
  return active
}
