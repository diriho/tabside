import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, Check, CreditCard, Hand, Receipt, Truck, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { minorToInputString, parseMoneyToMinor } from '@shared/currency'
import { formatRate } from '@shared/tax'
import { OrderLines } from '@/components/orders/OrderTicket'
import { TABLE_STATE } from '@/components/tables/TableGrid'
import { Button } from '@/components/ui/Button'
import { Money, StatusPill } from '@/components/ui/Display'
import { InlineAlert, Spinner } from '@/components/ui/Feedback'
import { Field, Input, Segmented } from '@/components/ui/Form'
import { ConfirmDialog, Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/hooks/useToast'
import { errorMessage } from '@/lib/errors'
import { elapsed, formatTime } from '@/lib/time'
import {
  advanceSessionOrders, closeSession, listSessionPayments, listSessionRequests, recordManualPayment, setOrderStatus, updateRequest,
} from '@/services/operations'
import { getBill, listSessionOrders } from '@/services/sessions'
import type { BoardTable, StaffRole } from '@/types/domain'
import { staffKeys } from './staffKeys'

export function TableDetailSheet({
  table,
  restaurantId,
  currency,
  timeZone,
  role,
  onClose,
}: {
  table: BoardTable | null
  restaurantId: string
  currency: string
  timeZone: string
  role: StaffRole
  onClose: () => void
}) {
  const sessionId = table?.session_id ?? null
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = staffKeys.session(restaurantId, sessionId ?? 'none')

  const data = useQuery({
    queryKey: key,
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const [orders, bill, requests, payments] = await Promise.all([
        listSessionOrders(sessionId!),
        getBill(sessionId!),
        listSessionRequests(sessionId!),
        listSessionPayments(sessionId!),
      ])
      return { orders, bill, requests, payments }
    },
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: staffKeys.all(restaurantId) })
  const onError = (title: string) => (err: unknown) => toast.error(title, errorMessage(err))

  const deliverAll = useMutation({
    mutationFn: () => advanceSessionOrders(sessionId!, 'ready', 'delivered'),
    onSuccess: (n) => {
      void refresh()
      toast.success(`${n} ${n === 1 ? 'order' : 'orders'} delivered`)
    },
    onError: onError('Couldn’t update'),
  })
  const deliverOne = useMutation({ mutationFn: (orderId: string) => setOrderStatus(orderId, 'delivered'), onSuccess: () => void refresh(), onError: onError('Couldn’t update') })
  const handleRequest = useMutation({
    mutationFn: (v: { id: string; status: 'acknowledged' | 'resolved' }) => updateRequest(v.id, v.status),
    onSuccess: () => void refresh(),
    onError: onError('Couldn’t update the request'),
  })

  const [method, setMethod] = useState<'cash' | 'card' | 'other'>('card')
  const [amount, setAmount] = useState('')
  const due = data.data?.bill.due_minor ?? 0
  useEffect(() => {
    setAmount(due > 0 ? minorToInputString(due, currency) : '')
  }, [due, currency, sessionId])
  const parsedAmount = parseMoneyToMinor(amount, currency)
  const pay = useMutation({
    mutationFn: () => recordManualPayment(sessionId!, method, parsedAmount ?? undefined),
    onSuccess: () => {
      void refresh()
      toast.success('Payment recorded')
    },
    onError: onError('Couldn’t record the payment'),
  })

  const [confirmClose, setConfirmClose] = useState(false)
  const close = useMutation({
    mutationFn: (force: boolean) => closeSession(sessionId!, force),
    onSuccess: () => {
      void refresh()
      toast.success(`Table ${table?.label} cleared`)
      setConfirmClose(false)
      onClose()
    },
    onError: onError('Couldn’t clear the table'),
  })

  // A server opening the table counts as acknowledging its requests (the guest sees "they've seen it").
  const openRequests = data.data?.requests ?? []
  const unacknowledged = role === 'kitchen' ? '' : openRequests.filter((r) => r.status === 'open').map((r) => r.id).join()
  useEffect(() => {
    for (const id of unacknowledged.split(',').filter(Boolean)) handleRequest.mutate({ id, status: 'acknowledged' })
    // handleRequest is stable enough for this fire-once effect; re-run only when the open set changes
  }, [unacknowledged])

  if (!table) return null
  const s = TABLE_STATE[table.state]
  const canTakePayment = role !== 'kitchen'
  const bill = data.data?.bill
  const orders = [...(data.data?.orders ?? [])].reverse()
  const readyCount = orders.filter((o) => o.status === 'ready').length

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={`Table ${table.label}`}
      description={
        table.session_id
          ? `${s.label}. ${table.party_size} ${table.party_size === 1 ? 'guest' : 'guests'}, seated ${elapsed(table.opened_at!)}${table.guest_count ? `, ${table.guest_count} ${table.guest_count === 1 ? 'phone' : 'phones'} on the tab` : ''}.`
          : 'Free. Guests can scan the table’s code to open a tab.'
      }
    >
      {!sessionId ? null : data.isPending ? (
        <div className="py-10 text-center"><Spinner /></div>
      ) : data.isError ? (
        <InlineAlert tone="danger">{errorMessage(data.error)}</InlineAlert>
      ) : (
        <div className="space-y-6 pb-2">
          {openRequests.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border border-clay/40 bg-clay-soft p-3">
              {r.type === 'bill' ? <Receipt className="size-5 text-clay" /> : <Hand className="size-5 text-clay" />}
              <div className="flex-1">
                <p className="font-bold">{r.type === 'bill' ? 'Bill requested' : 'Calling for service'}</p>
                <p className="text-sm text-ink-2">
                  {elapsed(r.created_at)} ago{r.preferred_method ? `, paying by ${r.preferred_method}` : ''}{r.note ? `: “${r.note}”` : ''}
                </p>
              </div>
              {r.type === 'waiter' && (
                <Button size="sm" variant="secondary" icon={<Check className="size-4" />} onClick={() => handleRequest.mutate({ id: r.id, status: 'resolved' })}>Done</Button>
              )}
            </div>
          ))}

          <section aria-labelledby="t-orders">
            <div className="flex items-center justify-between gap-3">
              <h3 id="t-orders" className="text-lg font-bold">Orders</h3>
              {readyCount > 0 && (
                <Button variant="sage" size="sm" icon={<Truck className="size-4" />} loading={deliverAll.isPending} onClick={() => deliverAll.mutate()}>
                  Deliver {readyCount > 1 ? `all ${readyCount} ready` : 'ready order'}
                </Button>
              )}
            </div>
            {orders.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">No orders yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {orders.map((o) => (
                  <li key={o.id} className="rounded-lg border border-line bg-surface p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-bold">Round {o.session_seq}</span>
                      <span className="text-sm text-ink-3">#{o.order_number}, {formatTime(o.placed_at, timeZone)}</span>
                      <span className="flex-1" />
                      <StatusPill status={o.status} />
                      {o.status === 'ready' && (
                        <Button size="sm" variant="secondary" onClick={() => deliverOne.mutate(o.id)}>Delivered</Button>
                      )}
                    </div>
                    <OrderLines order={o} currency={currency} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {bill && bill.order_count > 0 && (
            <section aria-labelledby="t-bill" className="paper rounded-lg border border-line p-4">
              <h3 id="t-bill" className="text-lg font-bold">Bill</h3>
              <dl className="mt-2 space-y-1 text-[15px]">
                <div className="flex justify-between"><dt className="text-ink-2">Subtotal</dt><dd><Money minor={bill.subtotal_minor} currency={currency} /></dd></div>
                {bill.taxes.map((t) => (
                  <div key={`${t.name}${t.rate_bps}`} className="flex justify-between">
                    <dt className="text-ink-2">{t.name} {formatRate(t.rate_bps)}{t.is_inclusive ? ' (incl.)' : ''}</dt>
                    <dd><Money minor={t.amount_minor} currency={currency} /></dd>
                  </div>
                ))}
                <div className="flex justify-between font-bold"><dt>Total</dt><dd><Money minor={bill.total_minor} currency={currency} /></dd></div>
                {data.data.payments.filter((p) => p.status === 'succeeded').map((p) => (
                  <div key={p.id} className="flex justify-between text-ink-2">
                    <dt className="capitalize">Paid by {p.method === 'stripe' ? 'card online' : p.method}{p.confirmed_at ? `, ${formatTime(p.confirmed_at, timeZone)}` : ''}</dt>
                    <dd><Money minor={-p.amount_minor} currency={currency} /></dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between border-t border-line pt-2">
                  <dt className="font-bold">Due</dt>
                  <dd className="display text-2xl font-extrabold"><Money minor={bill.due_minor} currency={currency} /></dd>
                </div>
              </dl>
            </section>
          )}

          {canTakePayment && bill && bill.due_minor > 0 && ['open', 'bill_requested'].includes(bill.status) && (
            <section aria-labelledby="t-pay" className="rounded-lg border border-line bg-surface p-4">
              <h3 id="t-pay" className="font-bold">Record a payment</h3>
              <p className="text-sm text-ink-2">Only confirm once the money is in hand or the terminal has approved it.</p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Segmented
                  label="Payment method"
                  value={method}
                  onChange={setMethod}
                  options={[
                    { value: 'card', label: <><CreditCard className="size-4" /> Card</> },
                    { value: 'cash', label: <><Banknote className="size-4" /> Cash</> },
                    { value: 'other', label: <><Wallet className="size-4" /> Other</> },
                  ]}
                />
                <Field label={`Amount (${currency})`} className="w-36" error={amount && parsedAmount === null ? 'Invalid amount' : null}>
                  {(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="tnum" />}
                </Field>
                <Button
                  loading={pay.isPending}
                  disabled={!parsedAmount || parsedAmount > bill.due_minor}
                  onClick={() => pay.mutate()}
                >
                  Confirm payment
                </Button>
              </div>
            </section>
          )}

          {bill?.status === 'paid' && (
            <InlineAlert tone="success">This table has paid in full. Clear it once the guests have left.</InlineAlert>
          )}

          {role !== 'kitchen' && <div className="flex justify-end border-t border-line pt-4">
            <Button variant={bill?.status === 'paid' ? 'primary' : 'secondary'} onClick={() => (bill && bill.due_minor > 0 ? setConfirmClose(true) : close.mutate(false))} loading={close.isPending && !confirmClose}>
              Clear table
            </Button>
          </div>}
        </div>
      )}

      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => close.mutate(true)}
        loading={close.isPending}
        title={`Close Table ${table.label} with a balance?`}
        body={
          <p>
            <Money minor={due} currency={currency} className="font-bold text-ink" /> hasn’t been paid. Only a manager can close an unpaid tab (for example after a walkout or a comp).
            The orders stay in your records.
          </p>
        }
        confirmLabel="Close unpaid tab"
      />
    </Sheet>
  )
}
