import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { DAYS, DAY_LABELS, isValidTime, type OpeningHours, type Period } from '@shared/hours'
import { Panel, PageHeader } from '@/components/layout/Page'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ErrorState, InlineAlert, PageLoader } from '@/components/ui/Feedback'
import { Field, Input, Segmented, Select, Switch, Textarea } from '@/components/ui/Form'
import { ImageField } from '@/components/ui/ImageField'
import { ConfirmDialog } from '@/components/ui/Sheet'
import { useAuth, useStaffContext } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { errorMessage } from '@/lib/errors'
import { deleteRestaurant, getRestaurant, listCurrencies, setRestaurantStatus, updateRestaurant } from '@/services/restaurants'
import type { Restaurant } from '@/types/domain'
import type { Json } from '@/types/database'

const TIMEZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone')
  } catch {
    return ['UTC']
  }
})()

type Draft = Pick<
  Restaurant,
  'name' | 'tagline' | 'description' | 'logo_url' | 'hero_image_url' | 'address' | 'phone' | 'email' | 'website_url' | 'instagram_handle' |
  'timezone' | 'currency' | 'menu_mode' | 'menu_pdf_url' | 'ordering_enabled'
> & { opening_hours: OpeningHours }

function toDraft(r: Restaurant): Draft {
  return {
    name: r.name, tagline: r.tagline, description: r.description, logo_url: r.logo_url, hero_image_url: r.hero_image_url,
    address: r.address, phone: r.phone, email: r.email, website_url: r.website_url, instagram_handle: r.instagram_handle,
    timezone: r.timezone, currency: r.currency, menu_mode: r.menu_mode, menu_pdf_url: r.menu_pdf_url, ordering_enabled: r.ordering_enabled,
    opening_hours: (r.opening_hours ?? {}) as OpeningHours,
  }
}

export default function RestaurantSettingsPage() {
  const staff = useStaffContext()
  const { memberships } = useAuth()
  const restaurantId = staff.restaurant.id
  const queryClient = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const welcome = params.get('welcome') === '1'

  const restaurant = useQuery({ queryKey: ['admin', restaurantId, 'restaurant'], queryFn: () => getRestaurant(restaurantId) })
  const currencies = useQuery({ queryKey: ['currencies'], queryFn: listCurrencies, staleTime: Infinity })
  const [draft, setDraft] = useState<Draft | null>(null)
  useEffect(() => {
    if (restaurant.data) setDraft(toDraft(restaurant.data))
  }, [restaurant.data])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', restaurantId] })
    void queryClient.invalidateQueries({ queryKey: ['memberships'] })
    void queryClient.invalidateQueries({ queryKey: ['restaurant'] })
  }

  const hoursError = draft && DAYS.some((d) => (draft.opening_hours[d] ?? []).some((p) => !isValidTime(p.open) || !isValidTime(p.close)))

  const save = useMutation({
    mutationFn: () => {
      const d = draft!
      const clean = (v: string | null) => (v && v.trim() ? v.trim() : null)
      return updateRestaurant(restaurantId, {
        ...d,
        opening_hours: d.opening_hours as unknown as NonNullable<Json>,
        name: d.name.trim(),
        tagline: clean(d.tagline), description: clean(d.description), address: clean(d.address), phone: clean(d.phone),
        email: clean(d.email), website_url: clean(d.website_url), instagram_handle: clean(d.instagram_handle?.replace(/^@/, '') ?? null),
      })
    },
    onSuccess: () => {
      invalidate()
      toast.success('Restaurant saved')
    },
    onError: (err) => toast.error('Couldn’t save', errorMessage(err)),
  })

  const [confirm, setConfirm] = useState<'close' | 'delete' | null>(null)
  const toggleOpen = useMutation({
    mutationFn: (status: 'active' | 'closed') => setRestaurantStatus(restaurantId, status),
    onSuccess: (_d, status) => {
      invalidate()
      setConfirm(null)
      toast.success(status === 'closed' ? 'Restaurant closed' : 'Restaurant reopened', status === 'closed' ? 'Guests can’t start new orders. Open tabs can still be paid.' : 'Guests can order again.')
    },
    onError: (err) => toast.error('Couldn’t update', errorMessage(err)),
  })
  const remove = useMutation({
    mutationFn: () => deleteRestaurant(restaurantId, restaurant.data!.slug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['memberships'] })
      toast.success('Restaurant deleted', 'Its records are kept for your accounts.')
      navigate(memberships.length > 1 ? '/admin' : '/onboarding', { replace: true })
    },
    onError: (err) => toast.error('Couldn’t delete', errorMessage(err)),
  })

  if (restaurant.isPending || !draft) return restaurant.isError ? <ErrorState error={restaurant.error} onRetry={() => void restaurant.refetch()} /> : <PageLoader />
  const r = restaurant.data!
  const dirty = JSON.stringify(toDraft(r)) !== JSON.stringify(draft)

  return (
    <div className="pb-24">
      <PageHeader
        title="Restaurant"
        description="What guests see on your page and when they scan a table."
        actions={<ButtonLink to={`/r/${r.slug}`} target="_blank" variant="secondary" icon={<ExternalLink className="size-4" />}>View public page</ButtonLink>}
      />

      {welcome && (
        <InlineAlert tone="success" className="mb-6">
          <p className="font-bold">{r.name} is set up.</p>
          <p className="mt-1">Next: <Link className="font-semibold text-clay" to="/admin/menu">add your menu</Link>, then <Link className="font-semibold text-clay" to="/admin/tables">add tables and print their QR codes</Link>, and <Link className="font-semibold text-clay" to="/admin/staff">invite your team</Link>.</p>
        </InlineAlert>
      )}

      <div className="space-y-6">
        <Panel title="Profile">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">{(p) => <Input {...p} required value={draft.name} onChange={(e) => set('name', e.target.value)} />}</Field>
            <Field label="Tagline" optional>{(p) => <Input {...p} maxLength={160} value={draft.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} placeholder="Neighbourhood kitchen & bar" />}</Field>
            <Field label="Description" optional className="sm:col-span-2">
              {(p) => <Textarea {...p} maxLength={4000} value={draft.description ?? ''} onChange={(e) => set('description', e.target.value)} />}
            </Field>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <ImageField label="Logo" value={draft.logo_url} onChange={(v) => set('logo_url', v)} restaurantId={restaurantId} folder="branding" aspect="aspect-square" />
            <ImageField label="Hero photo" value={draft.hero_image_url} onChange={(v) => set('hero_image_url', v)} restaurantId={restaurantId} folder="branding" />
          </div>
        </Panel>

        <Panel title="Contact & location">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Address" optional className="sm:col-span-2">{(p) => <Input {...p} value={draft.address ?? ''} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" />}</Field>
            <Field label="Phone" optional>{(p) => <Input {...p} type="tel" value={draft.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />}</Field>
            <Field label="Email" optional>{(p) => <Input {...p} type="email" value={draft.email ?? ''} onChange={(e) => set('email', e.target.value)} />}</Field>
            <Field label="Website" optional>{(p) => <Input {...p} type="url" value={draft.website_url ?? ''} onChange={(e) => set('website_url', e.target.value)} placeholder="https://" />}</Field>
            <Field label="Instagram" optional>{(p) => <Input {...p} value={draft.instagram_handle ?? ''} onChange={(e) => set('instagram_handle', e.target.value)} placeholder="@yourrestaurant" />}</Field>
          </div>
        </Panel>

        <Panel title="Opening hours" description="Shown on your public page. Ordering isn’t blocked outside these hours — use the switch below for that.">
          <HoursEditor value={draft.opening_hours} onChange={(v) => set('opening_hours', v)} />
          {hoursError && <p className="mt-2 text-sm font-semibold text-danger">Use 24-hour times like 09:30 or 22:00.</p>}
        </Panel>

        <Panel title="Money" description="Prices are stored in the currency’s smallest unit, so switching currency doesn’t convert existing prices — update them after switching.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency" hint={draft.currency !== r.currency ? 'Check your menu prices after saving.' : undefined}>
              {(p) => (
                <Select {...p} value={draft.currency} onChange={(e) => set('currency', e.target.value)}>
                  {(currencies.data ?? [{ code: r.currency, name: r.currency }]).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Time zone" hint="Used for “today” on your dashboard and for opening hours.">
              {(p) => (
                <Select {...p} value={draft.timezone} onChange={(e) => set('timezone', e.target.value)}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
                </Select>
              )}
            </Field>
          </div>
          <p className="mt-4 text-sm text-ink-2">Tax rates and whether prices include tax are set per tax under <Link to="/admin/menu" className="font-semibold text-clay">Menu & taxes</Link>.</p>
        </Panel>

        <Panel title="Ordering & menu">
          <div className="space-y-5">
            <Switch
              checked={draft.ordering_enabled}
              onChange={(v) => set('ordering_enabled', v)}
              label="Guests can order from their table"
              description="Turn off to pause ordering (for example during a private event). Guests can still view the menu and their bill."
            />
            <div>
              <p className="text-[15px] font-semibold">Public menu format</p>
              <p className="mb-2 text-sm text-ink-2">Ordering always uses your structured menu. This only changes what “View menu” shows.</p>
              <Segmented
                label="Public menu format"
                value={draft.menu_mode}
                onChange={(v) => set('menu_mode', v)}
                options={[{ value: 'html', label: 'Structured menu' }, { value: 'pdf', label: 'PDF upload' }]}
              />
            </div>
            {draft.menu_mode === 'pdf' && (
              <ImageField kind="pdf" label="Menu PDF" value={draft.menu_pdf_url} onChange={(v) => set('menu_pdf_url', v)} restaurantId={restaurantId} folder="menus" />
            )}
            {draft.menu_mode === 'pdf' && !draft.menu_pdf_url && <InlineAlert tone="warning">Upload a PDF, or guests will see the structured menu.</InlineAlert>}
          </div>
        </Panel>

        <Panel title="Close or delete">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{r.status === 'active' ? 'Close the restaurant' : 'The restaurant is closed'}</p>
                <p className="text-sm text-ink-2">
                  {r.status === 'active'
                    ? 'Stops new tabs and orders. Open tabs can still be paid, and you can reopen anytime.'
                    : 'Guests can’t start new orders. Reopen when you’re ready.'}
                </p>
              </div>
              {r.status === 'active' ? (
                <Button variant="secondary" onClick={() => setConfirm('close')}>Close restaurant</Button>
              ) : (
                <Button loading={toggleOpen.isPending} onClick={() => toggleOpen.mutate('active')}>Reopen</Button>
              )}
            </div>
            {staff.is_owner && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                <div>
                  <p className="font-semibold text-danger">Delete restaurant</p>
                  <p className="text-sm text-ink-2">Removes it from TABSide for guests and staff. Orders and payments are kept for your records.</p>
                </div>
                <Button variant="danger" onClick={() => setConfirm('delete')}>Delete restaurant</Button>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur-md lg:left-[264px]">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-4 py-3 sm:px-6">
          {dirty && <span className="text-sm text-ink-2">Unsaved changes</span>}
          <Button variant="secondary" disabled={!dirty} onClick={() => setDraft(toDraft(r))}>Discard</Button>
          <Button loading={save.isPending} disabled={!dirty || !draft.name.trim() || Boolean(hoursError)} onClick={() => save.mutate()} icon={<Check className="size-4" />}>
            Save changes
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'close'}
        onClose={() => setConfirm(null)}
        onConfirm={() => toggleOpen.mutate('closed')}
        loading={toggleOpen.isPending}
        title={`Close ${r.name}?`}
        body={<p>Guests won’t be able to open tabs or order. Tables with open tabs can still pay. You can reopen anytime.</p>}
        confirmLabel="Close restaurant"
        tone="primary"
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={`Delete ${r.name}?`}
        body={<p>The public page, menu and QR codes stop working for everyone. Order and payment records are preserved. This can’t be undone from the app.</p>}
        confirmLabel="Delete restaurant"
        requireText={r.slug}
      />
    </div>
  )
}

function HoursEditor({ value, onChange }: { value: OpeningHours; onChange: (v: OpeningHours) => void }) {
  const setDay = (day: (typeof DAYS)[number], periods: Period[]) => onChange({ ...value, [day]: periods })
  return (
    <ul className="divide-y divide-line">
      {DAYS.map((day) => {
        const periods = value[day] ?? []
        return (
          <li key={day} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="w-28 font-semibold">{DAY_LABELS[day]}</span>
            {periods.length === 0 ? (
              <span className="flex-1 text-ink-3">Closed</span>
            ) : (
              <div className="flex flex-1 flex-wrap gap-2">
                {periods.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    <Input aria-label={`${DAY_LABELS[day]} opens`} type="time" value={p.open} onChange={(e) => setDay(day, periods.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} className="h-10 w-[7.5rem]" />
                    <span className="text-ink-3">to</span>
                    <Input aria-label={`${DAY_LABELS[day]} closes`} type="time" value={p.close} onChange={(e) => setDay(day, periods.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} className="h-10 w-[7.5rem]" />
                    <button type="button" aria-label="Remove hours" className="rounded-full p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" onClick={() => setDay(day, periods.filter((_, j) => j !== i))}>
                      <X className="size-4" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {periods.length < 2 && (
              <Button variant="quiet" size="sm" icon={<Plus className="size-4" />} onClick={() => setDay(day, [...periods, periods.length ? { open: '17:00', close: '22:00' } : { open: '11:00', close: '22:00' }])}>
                {periods.length ? 'Split shift' : 'Add hours'}
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
