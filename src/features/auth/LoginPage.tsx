import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { InlineAlert } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Form'
import { unwrap } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { AuthShell } from './AuthShell'

const DEMO = [
  { label: 'Manager', email: 'manager@theglobe.test' },
  { label: 'Kitchen', email: 'kitchen@theglobe.test' },
  { label: 'Waitstaff', email: 'waiter@theglobe.test' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const signIn = useMutation({
    mutationFn: async (creds: { email: string; password: string }) => {
      const { data } = await supabase.auth.getSession()
      // A guest's anonymous identity is replaced by the staff account on this device.
      if (data.session?.user.is_anonymous) await supabase.auth.signOut()
      const res = unwrap(await supabase.auth.signInWithPassword(creds))
      const roles = unwrap(await supabase.from('staff_members').select('role').eq('user_id', res.user!.id).eq('is_active', true))
      return roles
    },
    onSuccess: async (roles) => {
      await queryClient.invalidateQueries({ queryKey: ['memberships'] })
      const next = params.get('next')
      if (next?.startsWith('/')) navigate(next, { replace: true })
      else if (roles.length === 0) navigate('/onboarding', { replace: true })
      else navigate(roles.some((r) => r.role === 'manager') ? '/admin' : '/staff', { replace: true })
    },
  })

  const message = signIn.error
    ? /invalid login/i.test(String((signIn.error as Error).message)) ? 'That email and password don’t match an account.' : (signIn.error as Error).message
    : null

  return (
    <AuthShell
      title="Staff sign in"
      subtitle="For managers, kitchen and waitstaff. Guests don’t need an account — just scan the table’s code."
      footer={<>New restaurant? <Link to="/signup" className="font-semibold text-clay">Create an account</Link></>}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          signIn.mutate({ email: email.trim(), password })
        }}
      >
        <Field label="Email">{(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Password">{(p) => <Input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        {message && <InlineAlert tone="danger">{message}</InlineAlert>}
        <Button type="submit" size="lg" block loading={signIn.isPending}>Sign in</Button>
      </form>

      {import.meta.env.DEV && (
        <div className="mt-8 rounded-xl border border-dashed border-line-strong p-4">
          <p className="text-sm font-semibold">Demo accounts for The Globe</p>
          <p className="text-[13px] text-ink-2">Password: tabside-demo</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO.map((d) => (
              <Button key={d.email} variant="secondary" size="sm" disabled={signIn.isPending} onClick={() => signIn.mutate({ email: d.email, password: 'tabside-demo' })}>
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  )
}
