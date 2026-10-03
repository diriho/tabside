import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { InlineAlert, PageLoader } from '@/components/ui/Feedback'
import { Field, Input, Select } from '@/components/ui/Form'
import { useAuth } from '@/hooks/useAuth'
import { errorMessage } from '@/lib/errors'
import { createRestaurant, listCurrencies } from '@/services/restaurants'
import { AuthShell } from './AuthShell'

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

const TIMEZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone')
  } catch {
    return ['UTC']
  }
})()

export default function OnboardingPage() {
  const { ready, isStaffAccount, memberships, membershipsLoading, setActiveRestaurant } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currencies = useQuery({ queryKey: ['currencies'], queryFn: listCurrencies, staleTime: Infinity })
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [currency, setCurrency] = useState('USD')
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')

  const create = useMutation({
    mutationFn: () => createRestaurant({ name: name.trim(), slug, currency, timezone }),
    onSuccess: async (restaurant) => {
      setActiveRestaurant(restaurant.id)
      await queryClient.invalidateQueries({ queryKey: ['memberships'] })
      navigate('/admin/restaurant?welcome=1', { replace: true })
    },
  })

  if (!ready || membershipsLoading) return <PageLoader />
  if (!isStaffAccount) return <Navigate to="/login?next=/onboarding" replace />

  return (
    <AuthShell
      title={memberships.length ? 'Add another restaurant' : 'Name your restaurant'}
      subtitle="You can change everything here later, except the web address while guests have it bookmarked."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <Field label="Restaurant name">
          {(p) => (
            <Input
              {...p}
              required
              maxLength={120}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!slugTouched) setSlug(slugify(e.target.value))
              }}
            />
          )}
        </Field>
        <Field label="Web address" hint={`${window.location.host}/r/${slug || 'your-restaurant'}`}>
          {(p) => (
            <Input
              {...p}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              minLength={2}
              maxLength={60}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(slugify(e.target.value))
              }}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency">
            {(p) => (
              <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {(currencies.data ?? [{ code: 'USD', name: 'US Dollar' }]).map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Time zone">
            {(p) => (
              <Select {...p} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
              </Select>
            )}
          </Field>
        </div>
        {create.isError && <InlineAlert tone="danger">{errorMessage(create.error)}</InlineAlert>}
        <Button type="submit" size="lg" block loading={create.isPending} disabled={!name.trim() || slug.length < 2}>
          Create restaurant
        </Button>
      </form>
    </AuthShell>
  )
}
