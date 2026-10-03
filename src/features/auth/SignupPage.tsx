import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { InlineAlert } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Form'
import { unwrap } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { AuthShell } from './AuthShell'

export default function SignupPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [needsConfirm, setNeedsConfirm] = useState(false)

  const signUp = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user.is_anonymous) await supabase.auth.signOut()
      return unwrap(
        await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/onboarding` },
        }),
      )
    },
    onSuccess: (res) => {
      if (res.session) navigate('/onboarding', { replace: true })
      else setNeedsConfirm(true)
    },
  })

  if (needsConfirm) {
    return (
      <AuthShell title="Check your email" subtitle={`We sent a confirmation link to ${email}. Open it on this device to set up your restaurant.`}>
        <Link to="/login" className="font-semibold text-clay">Back to sign in</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Set up your restaurant"
      subtitle="Create the owner account first. You’ll add your menu, tables and team next."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-clay">Sign in</Link></>}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          signUp.mutate()
        }}
      >
        <Field label="Your name">{(p) => <Input {...p} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Work email">{(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Password" hint="At least 8 characters.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        {signUp.isError && <InlineAlert tone="danger">{(signUp.error as Error).message}</InlineAlert>}
        <Button type="submit" size="lg" block loading={signUp.isPending}>Create account</Button>
      </form>
    </AuthShell>
  )
}
