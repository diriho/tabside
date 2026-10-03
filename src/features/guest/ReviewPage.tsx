import { useMutation, useQuery } from '@tanstack/react-query'
import { Heart, Hourglass } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { StarInput, Stars } from '@/components/ui/Display'
import { EmptyState, InlineAlert, PageLoader } from '@/components/ui/Feedback'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { errorMessage } from '@/lib/errors'
import { getMyReview, submitReview } from '@/services/sessions'
import { useGuest } from './guestContext'

export default function ReviewPage() {
  const { sessionId, ctx } = useGuest()
  const existing = useQuery({ queryKey: ['my-review', sessionId], queryFn: () => getMyReview(sessionId) })
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [name, setName] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (existing.data) {
      setRating(existing.data.rating)
      setBody(existing.data.body ?? '')
      setName(existing.data.guest_name ?? '')
    }
  }, [existing.data])

  const submit = useMutation({
    mutationFn: () => submitReview(sessionId, rating, body.trim() || undefined, name.trim() || undefined),
    onSuccess: () => setDone(true),
  })

  const settled = ctx.session.status === 'paid' || ctx.session.status === 'closed'
  if (!settled) {
    return (
      <EmptyState
        className="pt-20"
        icon={<Hourglass />}
        title="Reviews open once the tab is settled"
        body="Enjoy the rest of your meal — we’ll ask how it went after you’ve paid."
        action={<ButtonLink to={`/session/${sessionId}/bill`} variant="secondary">See the bill</ButtonLink>}
      />
    )
  }
  if (existing.isPending) return <PageLoader />

  if (done) {
    return (
      <EmptyState
        className="pt-20"
        icon={<Heart />}
        title="Thanks for the review"
        body={
          <span className="flex flex-col items-center gap-2">
            <Stars value={rating} size="lg" />
            <span>{ctx.restaurant.name} reads every one.</span>
          </span>
        }
        action={<ButtonLink to={`/r/${ctx.restaurant.slug}`} variant="secondary">Visit {ctx.restaurant.name}’s page</ButtonLink>}
      />
    )
  }

  return (
    <form
      className="px-4 pt-8"
      onSubmit={(e) => {
        e.preventDefault()
        if (rating > 0) submit.mutate()
      }}
    >
      <h1 className="display text-center text-[30px] font-extrabold">How was {ctx.restaurant.name}?</h1>
      <p className="mt-1 text-center text-[15px] text-ink-2">Your rating helps other diners and the team.</p>
      <div className="mt-6">
        <StarInput value={rating} onChange={setRating} />
      </div>
      <div className="mt-6 space-y-4">
        <Field label="Tell us more" optional>
          {(p) => <Textarea {...p} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did you love? What could be better?" />}
        </Field>
        <Field label="Your first name" optional hint="Shown with your review if the restaurant features it.">
          {(p) => <Input {...p} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />}
        </Field>
      </div>
      {submit.isError && <InlineAlert tone="danger" className="mt-4">{errorMessage(submit.error)}</InlineAlert>}
      <Button type="submit" size="xl" block className="mt-6" disabled={rating === 0} loading={submit.isPending}>
        {existing.data ? 'Update review' : 'Send review'}
      </Button>
    </form>
  )
}
