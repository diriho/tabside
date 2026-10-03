import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, BellRing, CheckCircle2, CreditCard, Loader2, Receipt, Star } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { formatRate } from '@shared/tax'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Money, TableNumeral } from '@/components/ui/Display'
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '@/components/ui/Feedback'
import { Segmented } from '@/components/ui/Form'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatTime } from '@/lib/time'
import { getBill, getPaymentsConfig, listOpenRequests, listSessionOrders, requestAssistance, startCheckout, syncPayment } from '@/services/sessions'
import type { OrderModifierSnapshot, PaymentMethod } from '@/types/domain'
import { guestKeys, useGuest } from './guestContext'

export default function BillPage() {
  const { sessionId, ctx } = useGuest()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const currency = ctx.restaurant.currency

  const bill = useQuery({ queryKey: guestKeys.bill(sessionId), queryFn: () => getBill(sessionId) })
  const orders = useQuery({ queryKey: guestKeys.orders(sessionId), queryFn: () => listSessionOrders(sessionId) })
  const requests = useQuery({ queryKey: guestKeys.requests(sessionId), queryFn: () => listOpenRequests(sessionId) })
  const config = useQuery({ queryKey: ['payments-config'], queryFn: getPaymentsConfig, staleTime: 60_000 })
  const [method, setMethod] = useState<Exclude<PaymentMethod, 'stripe' | 'other'>>('card')

  // Returning from Stripe Checkout.
  const checkout = params.get('checkout')
  const paymentId = params.get('payment')
  const [confirming, setConfirming] = useState(checkout === 'success')
  const synced = useRef(false)
  useEffect(() => {
    if (checkout === 'cancelled') {
      toast.toast('Payment cancelled', { body: 'Nothing was charged. You can pay now or ask for the check.' })
      setParams({}, { replace: true })
    }
  }, [checkout, setParams, toast])

  const paid = bill.data?.status === 'paid' || (bill.data?.status === 'closed' && bill.data.due_minor === 0 && bill.data.total_minor > 0)
  useEffect(() => {
    if (!confirming) return
    if (paid) {
      setConfirming(false)
      setParams({}, { replace: true })
      return
    }
    // The webhook normally lands first; if it hasn't after a moment, verify with Stripe directly.
    const t = setTimeout(() => {
      if (synced.current || !paymentId) return
      synced.current = true
      syncPayment(paymentId)
        .then(() => queryClient.invalidateQueries({ queryKey: guestKeys.bill(sessionId) }))
        .catch(() => undefined)
    }, 2500)
    const giveUp = setTimeout(() => setConfirming(false), 20_000)
    return () => {
      clearTimeout(t)
      clearTimeout(giveUp)
    }
  }, [confirming, paid, paymentId, queryClient, sessionId, setParams])

  const pay = useMutation({
    mutationFn: () => startCheckout(sessionId),
    onSuccess: ({ url }) => window.location.assign(url),
  })
  const askForCheck = useMutation({
    mutationFn: () => requestAssistance(sessionId, 'bill', method),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: guestKeys.requests(sessionId) })
      void queryClient.invalidateQueries({ queryKey: guestKeys.bill(sessionId) })
      toast.success('Your server is bringing the check')
    },
  })
  const callWaiter = useMutation({
    mutationFn: () => requestAssistance(sessionId, 'waiter'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: guestKeys.requests(sessionId) })
      toast.success('Someone’s on the way')
    },
  })

  const lines = useMemo(() => {
    const map = new Map<string, { name: string; detail: string; quantity: number; total: number }>()
    for (const o of orders.data ?? []) {
      if (o.status === 'cancelled') continue
      for (const l of o.order_items) {
        if (l.is_voided) continue
        const detail = [l.variant_name, ...(l.modifiers as unknown as OrderModifierSnapshot[]).map((m) => m.name)].filter(Boolean).join(', ')
        const key = `${l.name}|${detail}|${l.unit_price_minor}`
        const e = map.get(key) ?? { name: l.name, detail, quantity: 0, total: 0 }
        e.quantity += l.quantity
        e.total += l.line_total_minor
        map.set(key, e)
      }
    }
    return [...map.values()]
  }, [orders.data])

  if (bill.isPending || orders.isPending) {
    return (
      <div className="space-y-4 px-4 pt-6">
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }
  if (bill.isError) return <ErrorState error={bill.error} onRetry={() => void bill.refetch()} className="pt-16" />
  const b = bill.data

  if (b.order_count === 0) {
    return (
      <EmptyState
        className="pt-20"
        icon={<Receipt />}
        title="Nothing on the tab yet"
        body="Your table’s bill builds up here as you order."
        action={<ButtonLink to={`/session/${sessionId}`}>Browse the menu</ButtonLink>}
      />
    )
  }

  const billRequest = requests.data?.find((r) => r.type === 'bill')
  const waiterRequest = requests.data?.find((r) => r.type === 'waiter')
  const onlineEnabled = config.data?.onlinePayments ?? false

  return (
    <div className="px-4 pt-5 pb-8">
      {confirming && !paid && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-surface p-4" role="status">
          <Loader2 className="size-5 animate-spin text-clay" />
          <div>
            <p className="font-bold">Confirming your payment…</p>
            <p className="text-sm text-ink-2">This takes a few seconds. Please keep this page open.</p>
          </div>
        </div>
      )}

      {paid && (
        <section className="mb-6 rounded-xl bg-sage-soft p-5 text-center" aria-live="polite">
          <CheckCircle2 className="mx-auto size-11 text-sage" />
          <h1 className="display mt-2 text-[28px] font-extrabold">Payment successful</h1>
          <p className="mt-1 text-[15px] text-ink-2">Table {ctx.table.label}, total paid</p>
          <p className="display mt-1 text-4xl font-extrabold"><Money minor={b.paid_minor} currency={currency} /></p>
          <p className="mt-2 font-semibold">Thank you!</p>
          <ButtonLink to={`/session/${sessionId}/review`} variant="secondary" className="mt-4" icon={<Star className="size-4" />}>
            Rate your visit
          </ButtonLink>
        </section>
      )}

      {/* The guest check */}
      <article className="paper perf-bottom rounded-t-xl border border-b-0 border-line px-5 pt-5 pb-8 shadow-soft" aria-label="Bill">
        <header className="flex items-start justify-between border-b border-dashed border-line-strong pb-4">
          <div>
            <p className="font-bold">{ctx.restaurant.name}</p>
            <p className="text-[13px] text-ink-2">
              {formatDate(ctx.session.opened_at, { weekday: 'short', month: 'short', day: 'numeric' })}, opened {formatTime(ctx.session.opened_at, ctx.restaurant.timezone)}
            </p>
            <p className="text-[13px] text-ink-2">{ctx.session.party_size} {ctx.session.party_size === 1 ? 'guest' : 'guests'}, {b.order_count} {b.order_count === 1 ? 'round' : 'rounds'}</p>
          </div>
          <div className="text-center">
            <TableNumeral label={ctx.table.label} size="md" />
            <p className="text-[11px] font-semibold text-ink-3">Table</p>
          </div>
        </header>

        <ul className="space-y-2 py-4">
          {lines.map((l) => (
            <li key={`${l.name}${l.detail}${l.total}`} className="flex gap-3 text-[15px]">
              <span className="tnum w-7 shrink-0 font-semibold">{l.quantity}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug">{l.name}</p>
                {l.detail && <p className="text-[13px] text-ink-2">{l.detail}</p>}
              </div>
              <Money minor={l.total} currency={currency} />
            </li>
          ))}
        </ul>

        <dl className="space-y-1.5 border-t border-dashed border-line-strong pt-3 text-[15px]">
          <Row label="Subtotal"><Money minor={b.subtotal_minor} currency={currency} /></Row>
          {b.taxes.map((t) => (
            <Row key={`${t.name}${t.rate_bps}${t.is_inclusive}`} label={`${t.name} ${formatRate(t.rate_bps)}${t.is_inclusive ? ' (included)' : ''}`} muted={t.is_inclusive}>
              <Money minor={t.amount_minor} currency={currency} />
            </Row>
          ))}
          <div className="flex items-baseline justify-between pt-2">
            <dt className="text-lg font-bold">Total</dt>
            <dd className="display text-[28px] font-extrabold"><Money minor={b.total_minor} currency={currency} /></dd>
          </div>
          {b.paid_minor > 0 && (
            <>
              <Row label="Paid" muted><Money minor={-b.paid_minor} currency={currency} /></Row>
              <div className="flex items-baseline justify-between border-t border-line pt-2">
                <dt className="font-bold">Left to pay</dt>
                <dd className="text-xl font-extrabold"><Money minor={b.due_minor} currency={currency} /></dd>
              </div>
            </>
          )}
        </dl>
      </article>

      {!paid && b.status !== 'closed' && b.due_minor > 0 && (
        <section className="mt-6 space-y-3" aria-label="Pay">
          {pay.isError && <InlineAlert tone="danger">{errorMessage(pay.error)}</InlineAlert>}
          {b.pending_online_payment && !confirming && (
            <InlineAlert tone="info">Someone at your table has started paying online. If that wasn’t completed, try again in a few minutes.</InlineAlert>
          )}
          {onlineEnabled && (
            <Button size="xl" block loading={pay.isPending} onClick={() => pay.mutate()} icon={<CreditCard className="size-5" />} className="justify-center">
              Pay <Money minor={b.due_minor} currency={currency} /> now
            </Button>
          )}

          {billRequest ? (
            <div className="flex items-start gap-3 rounded-xl border border-brass/50 bg-brass-soft p-4" role="status">
              <BellRing className="mt-0.5 size-5 shrink-0 text-brass-ink" />
              <div>
                <p className="font-bold">Check requested</p>
                <p className="text-sm text-ink-2">
                  Your server is on the way{billRequest.preferred_method ? ` and knows you’re paying by ${billRequest.preferred_method}` : ''}.
                  {billRequest.status === 'acknowledged' ? ' They’ve seen your request.' : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="font-bold">{onlineEnabled ? 'Or pay with your server' : 'Pay with your server'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Segmented
                  label="How will you pay?"
                  value={method}
                  onChange={setMethod}
                  options={[
                    { value: 'card', label: <><CreditCard className="size-4" /> Card</> },
                    { value: 'cash', label: <><Banknote className="size-4" /> Cash</> },
                  ]}
                />
                <Button variant={onlineEnabled ? 'secondary' : 'primary'} loading={askForCheck.isPending} onClick={() => askForCheck.mutate()} className="flex-1">
                  Ask for the check
                </Button>
              </div>
              {askForCheck.isError && <p className="mt-2 text-sm text-danger">{errorMessage(askForCheck.error)}</p>}
            </div>
          )}
        </section>
      )}

      {b.status !== 'closed' && !paid && (
        <div className="mt-4 text-center">
          <Button
            variant="quiet"
            size="sm"
            disabled={Boolean(waiterRequest)}
            loading={callWaiter.isPending}
            onClick={() => callWaiter.mutate()}
            icon={<BellRing className="size-4" />}
          >
            {waiterRequest ? 'A server is on the way' : 'Call a server to the table'}
          </Button>
        </div>
      )}
    </div>
  )
}

function Row({ label, children, muted }: { label: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={cn('text-ink-2', muted && 'text-ink-3')}>{label}</dt>
      <dd className={cn(muted && 'text-ink-2')}>{children}</dd>
    </div>
  )
}
