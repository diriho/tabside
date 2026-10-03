import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ShoppingBag, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { formatRate } from '@shared/tax'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Money } from '@/components/ui/Display'
import { EmptyState, InlineAlert } from '@/components/ui/Feedback'
import { Stepper, Textarea } from '@/components/ui/Form'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/cn'
import { toAppError } from '@/lib/errors'
import { placeOrder, quoteOrder } from '@/services/sessions'
import { guestKeys, useGuest } from './guestContext'

export default function CartPage() {
  const { sessionId, ctx, cart, canOrder, orderBlockedReason } = useGuest()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [notes, setNotes] = useState('')
  const currency = ctx.restaurant.currency
  const orderable = cart.priced.filter((l) => !l.problem)

  // Authoritative quote from the database (debounced by cart identity).
  const quoteKey = JSON.stringify(orderable.map((l) => [l.itemId, l.variantId, l.modifierIds, l.quantity]))
  const [debouncedKey, setDebouncedKey] = useState(quoteKey)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKey(quoteKey), 250)
    return () => clearTimeout(t)
  }, [quoteKey])
  const quote = useQuery({
    queryKey: ['quote', sessionId, debouncedKey],
    queryFn: () => quoteOrder(sessionId, orderable),
    enabled: orderable.length > 0 && canOrder,
    retry: false,
  })
  const summary = quote.data && debouncedKey === quoteKey ? quote.data : cart.summary

  const place = useMutation({
    mutationFn: () => placeOrder(sessionId, orderable, notes),
    onSuccess: async (order) => {
      cart.clear()
      await queryClient.invalidateQueries({ queryKey: guestKeys.orders(sessionId) })
      toast.success(`Order #${order.order_number} sent to the kitchen`, 'You can keep adding to the tab anytime.')
      navigate(`/session/${sessionId}/orders`, { state: { highlight: order.id } })
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: guestKeys.menu(ctx.restaurant.id) }),
  })

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        className="pt-20"
        icon={<ShoppingBag />}
        title="Nothing in your order yet"
        body="Add dishes and drinks from the menu. Everything goes on your table’s shared tab."
        action={<ButtonLink to={`/session/${sessionId}`}>Browse the menu</ButtonLink>}
      />
    )
  }

  const placeError = place.error ? toAppError(place.error) : quote.error ? toAppError(quote.error) : null

  return (
    <div className="px-4 pt-3">
      <ButtonLink to={`/session/${sessionId}`} variant="quiet" size="sm" className="-ml-2" icon={<ArrowLeft className="size-4" />}>
        Back to the menu
      </ButtonLink>
      <h1 className="display mt-2 text-[30px] font-extrabold">Your order</h1>
      <p className="text-[15px] text-ink-2">
        Goes on Table {ctx.table.label}’s tab{ctx.session.order_count > 0 ? ` with the ${ctx.session.order_count} ${ctx.session.order_count === 1 ? 'order' : 'orders'} already placed` : ''}.
      </p>

      <ul className="mt-5 divide-y divide-line rounded-xl border border-line bg-surface">
        {cart.priced.map((line) => (
          <li key={line.key} className={cn('flex gap-3 p-4', line.problem && 'bg-danger-soft/50')}>
            <div className="min-w-0 flex-1">
              <p className="font-bold leading-snug">{line.name}</p>
              {line.detail && <p className="mt-0.5 text-sm text-ink-2">{line.detail}</p>}
              {line.problem ? (
                <p className="mt-1 text-sm font-semibold text-danger">{line.problem} — remove it to continue</p>
              ) : (
                <Money minor={line.lineTotalMinor} currency={currency} className="mt-1 block text-[15px] font-semibold" />
              )}
            </div>
            <div className="flex flex-col items-end justify-between gap-2">
              {line.problem ? (
                <Button variant="secondary" size="sm" onClick={() => cart.remove(line.key)} icon={<Trash2 className="size-4" />}>Remove</Button>
              ) : (
                <Stepper label={`${line.name} quantity`} value={line.quantity} min={0} onChange={(q) => cart.setQuantity(line.key, q)} />
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <label htmlFor="order-notes" className="font-bold">Note for the kitchen</label>
        <Textarea
          id="order-notes"
          className="mt-2 min-h-20"
          maxLength={500}
          placeholder="e.g. Bring the drinks first, it’s a birthday"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <dl className="mt-6 space-y-2 text-[15px]">
        <div className="flex justify-between">
          <dt className="text-ink-2">Subtotal</dt>
          <dd><Money minor={summary.subtotal_minor} currency={currency} /></dd>
        </div>
        {summary.taxes.map((t) => (
          <div key={`${t.name}-${t.rate_bps}-${t.is_inclusive}`} className="flex justify-between">
            <dt className="text-ink-2">{t.name} {formatRate(t.rate_bps)}{t.is_inclusive ? ' (included)' : ''}</dt>
            <dd className={cn(t.is_inclusive && 'text-ink-2')}><Money minor={t.amount_minor} currency={currency} /></dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <dt className="text-lg font-bold">Total</dt>
          <dd className="display text-[26px] font-extrabold"><Money minor={summary.total_minor} currency={currency} /></dd>
        </div>
      </dl>

      {orderBlockedReason && <InlineAlert tone="warning" className="mt-5">{orderBlockedReason}</InlineAlert>}
      {placeError && <InlineAlert tone="danger" className="mt-5">{placeError.message}</InlineAlert>}

      <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] -mx-4 mt-6 bg-linear-to-t from-bg from-70% to-transparent px-4 pt-6 pb-3">
        <Button
          size="xl"
          block
          disabled={!canOrder || cart.hasProblems || orderable.length === 0}
          loading={place.isPending}
          onClick={() => place.mutate()}
          className="justify-between"
        >
          <span>Place order</span>
          <Money minor={summary.total_minor} currency={currency} />
        </Button>
        <p className="mt-2 text-center text-[13px] text-ink-3">You’ll pay at the end — add more anytime.</p>
      </div>
    </div>
  )
}
