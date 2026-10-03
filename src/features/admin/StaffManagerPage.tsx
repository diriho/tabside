import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Crown, Plus, RefreshCw, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader, Panel } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, InlineAlert, PageLoader } from '@/components/ui/Feedback'
import { Field, Input, Select } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Sheet'
import { useStaffContext } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { createStaff, listStaff, updateStaff } from '@/services/operations'
import type { StaffRole } from '@/types/domain'

const ROLES: Array<{ value: StaffRole; label: string; description: string }> = [
  { value: 'kitchen', label: 'Kitchen', description: 'Sees and works incoming orders, marks items sold out.' },
  { value: 'waiter', label: 'Waitstaff', description: 'Kitchen access plus tables, bill requests and taking payment.' },
  { value: 'manager', label: 'Manager', description: 'Everything, including menu, prices, staff and reports.' },
]

function generatePassword(): string {
  const words = ['olive', 'ember', 'saffron', 'copper', 'basil', 'fennel', 'clay', 'harbor', 'maple', 'pepper']
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0]! % words.length]
  return `${pick()}-${pick()}-${(crypto.getRandomValues(new Uint32Array(1))[0]! % 900) + 100}`
}

export default function StaffManagerPage() {
  const me = useStaffContext()
  const restaurantId = me.restaurant.id
  const queryClient = useQueryClient()
  const toast = useToast()
  const staff = useQuery({ queryKey: ['admin', restaurantId, 'staff'], queryFn: () => listStaff(restaurantId) })
  const [adding, setAdding] = useState(false)

  const update = useMutation({
    mutationFn: (v: { id: string; patch: { role?: StaffRole; is_active?: boolean } }) => updateStaff(v.id, v.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', restaurantId, 'staff'] })
      toast.success('Staff member updated')
    },
    onError: (err) => toast.error('Couldn’t update', errorMessage(err)),
  })

  if (staff.isPending) return <PageLoader />
  if (staff.isError) return <ErrorState error={staff.error} onRetry={() => void staff.refetch()} />

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Everyone signs in with their own account. What they can do is enforced by the database, not just hidden in the app."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add staff</Button>}
      />
      <Panel>
        {staff.data.length === 0 ? (
          <EmptyState icon={<Users />} title="Just you so far" action={<Button onClick={() => setAdding(true)}>Add your first team member</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {staff.data.map((s) => {
              const self = s.id === me.id
              return (
                <li key={s.id} className={cn('flex flex-wrap items-center gap-3 py-3.5', !s.is_active && 'opacity-60')}>
                  <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 font-bold text-ink-2">{s.display_name[0]?.toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-semibold">
                      {s.display_name}
                      {s.is_owner && <Crown className="size-4 text-brass" aria-label="Owner" />}
                      {self && <span className="text-sm font-normal text-ink-3">(you)</span>}
                    </p>
                    <p className="truncate text-sm text-ink-2">{s.email}</p>
                  </div>
                  <Select
                    aria-label={`Role for ${s.display_name}`}
                    value={s.role}
                    disabled={s.is_owner || !s.is_active}
                    onChange={(e) => update.mutate({ id: s.id, patch: { role: e.target.value as StaffRole } })}
                    className="h-10 w-40 text-sm"
                  >
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </Select>
                  {!s.is_owner && !self && (
                    <Button size="sm" variant={s.is_active ? 'secondary' : 'primary'} onClick={() => update.mutate({ id: s.id, patch: { is_active: !s.is_active } })}>
                      {s.is_active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      <AddStaffSheet open={adding} restaurantId={restaurantId} onClose={() => setAdding(false)} />
    </div>
  )
}

function AddStaffSheet({ open, restaurantId, onClose }: { open: boolean; restaurantId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffRole>('kitchen')
  const [password, setPassword] = useState(generatePassword)
  const [created, setCreated] = useState<{ email: string; password: string; linked: boolean } | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setEmail('')
      setRole('kitchen')
      setPassword(generatePassword())
      setCreated(null)
    }
  }, [open])

  const create = useMutation({
    mutationFn: () => createStaff({ restaurantId, email: email.trim(), displayName: name.trim(), role, password }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', restaurantId, 'staff'] })
      setCreated({ email: email.trim(), password, linked: !res.created })
    },
  })

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={created ? 'Account ready' : 'Add a team member'}
      footer={
        created ? (
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button loading={create.isPending} disabled={!name.trim() || !email.trim() || password.length < 8} onClick={() => create.mutate()}>Create account</Button>
          </div>
        )
      }
    >
      {created ? (
        <div className="space-y-4">
          {created.linked ? (
            <InlineAlert tone="success">{created.email} already had a TABSide account. They can sign in with their existing password and will see this restaurant.</InlineAlert>
          ) : (
            <>
              <p className="text-[15px] text-ink-2">Share these sign-in details privately. They can sign in at <span className="font-semibold text-ink">{window.location.origin}/login</span>.</p>
              <div className="rounded-lg border border-line bg-surface-2 p-4 font-semibold">
                <p>{created.email}</p>
                <p className="tnum">{created.password}</p>
              </div>
              <Button
                variant="secondary"
                icon={<Copy className="size-4" />}
                onClick={async () => {
                  await navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}\nSign in: ${window.location.origin}/login`)
                  toast.success('Copied')
                }}
              >
                Copy details
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" data-autofocus />}</Field>
          <Field label="Email">{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />}</Field>
          <fieldset>
            <legend className="text-sm font-semibold">Role</legend>
            <div className="mt-1.5 space-y-2">
              {ROLES.map((r) => (
                <label key={r.value} className={cn('flex cursor-pointer gap-3 rounded-lg border p-3', role === r.value ? 'border-clay bg-clay-soft' : 'border-line')}>
                  <input type="radio" name="role" checked={role === r.value} onChange={() => setRole(r.value)} className="mt-1" />
                  <span>
                    <span className="block font-semibold">{r.label}</span>
                    <span className="block text-sm text-ink-2">{r.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Temporary password" hint="At least 8 characters. They can keep it or you can change it later.">
            {(p) => (
              <div className="flex gap-2">
                <Input {...p} value={password} onChange={(e) => setPassword(e.target.value)} className="tnum" />
                <Button variant="secondary" aria-label="Generate a new password" onClick={() => setPassword(generatePassword())}><RefreshCw className="size-4" /></Button>
              </div>
            )}
          </Field>
          {create.isError && <InlineAlert tone="danger">{errorMessage(create.error)}</InlineAlert>}
        </div>
      )}
    </Sheet>
  )
}
