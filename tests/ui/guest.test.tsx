import { act, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { GuestOrderCard } from '@/components/orders/OrderTicket'
import { MenuSections, useMenuSections } from '@/components/menu/MenuSections'
import { ItemSheet } from '@/features/guest/ItemSheet'
import { priceCart, useCart } from '@/hooks/useCart'
import type { OrderWithItems } from '@/types/domain'
import { burger, menu, wine } from './fixtures'

describe('cart', () => {
  it('merges identical lines, keeps different choices separate, and persists per tab', () => {
    const { result } = renderHook(() => useCart('session-1', menu))
    act(() => result.current.add({ itemId: 'fries', variantId: null, modifierIds: [], quantity: 1, notes: '' }))
    act(() => result.current.add({ itemId: 'fries', variantId: null, modifierIds: [], quantity: 2, notes: '' }))
    act(() => result.current.add({ itemId: 'burger', variantId: null, modifierIds: ['mr', 'bacon'], quantity: 1, notes: '' }))
    act(() => result.current.add({ itemId: 'burger', variantId: null, modifierIds: ['wd'], quantity: 1, notes: '' }))

    expect(result.current.lines).toHaveLength(3)
    expect(result.current.lines.find((l) => l.itemId === 'fries')?.quantity).toBe(3)

    // Another phone's tab is separate; a refresh restores this one
    const other = renderHook(() => useCart('session-2', menu))
    expect(other.result.current.lines).toHaveLength(0)
    const reloaded = renderHook(() => useCart('session-1', menu))
    expect(reloaded.result.current.lines).toHaveLength(3)
  })

  it('prices lines with modifiers and taxes the way the server does', () => {
    const { summary, lines } = priceCart(
      [
        { key: 'a', itemId: 'burger', variantId: null, modifierIds: ['mr', 'bacon'], quantity: 2, notes: '' },
        { key: 'b', itemId: 'wine', variantId: 'bottle', modifierIds: [], quantity: 1, notes: '' },
      ],
      menu,
    )
    expect(lines[0]!.unitPriceMinor).toBe(1650)
    expect(lines[1]!.lineTotalMinor).toBe(3800)
    // subtotal 3300 + 3800; sales 10% = 710; liquor 5% on wine = 190
    expect(summary).toMatchObject({ subtotal_minor: 7100, exclusive_tax_minor: 900, total_minor: 8000, item_count: 3 })
  })

  it('flags sold-out items instead of silently charging for them', () => {
    const { lines, summary } = priceCart([{ key: 'c', itemId: 'cake', variantId: null, modifierIds: [], quantity: 1, notes: '' }], menu)
    expect(lines[0]!.problem).toBe('Sold out')
    expect(summary.total_minor).toBe(0)
  })
})

function MenuHarness(props: { onSelect: () => void; onQuickAdd: () => void }) {
  const sections = useMenuSections(menu)
  return <MenuSections sections={sections} currency="USD" {...props} />
}

describe('menu', () => {
  it('lists categories and prices in the restaurant currency, and blocks sold-out items', async () => {
    const onSelect = vi.fn()
    const onQuickAdd = vi.fn()
    render(<MenuHarness onSelect={onSelect} onQuickAdd={onQuickAdd} />)

    expect(screen.getByRole('heading', { name: 'Food' })).toBeInTheDocument()
    expect(screen.getByText('from $10.00')).toBeInTheDocument()
    expect(screen.getByText('Sold out')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add Cake/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add Fries' }))
    expect(onQuickAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'fries' }))

    // Items with required choices open the sheet instead of adding blindly
    await userEvent.click(screen.getByRole('button', { name: 'Choose options for Burger' }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'burger' }))
  })
})

describe('item sheet', () => {
  it('requires the cook choice, caps extras, and prices the selection', async () => {
    const onAdd = vi.fn()
    render(<ItemSheet item={burger} currency="USD" onClose={() => {}} onAdd={onAdd} />)
    const dialog = screen.getByRole('dialog')

    await userEvent.click(within(dialog).getByRole('button', { name: /Add to order/ }))
    expect(onAdd).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByLabelText(/Medium rare/))
    await userEvent.click(within(dialog).getByLabelText(/Bacon/))
    await userEvent.click(within(dialog).getByLabelText(/Cheese/))
    expect(within(dialog).getByLabelText(/Egg/)).toBeDisabled() // max 2 add-ons

    await userEvent.click(within(dialog).getByRole('button', { name: 'Increase quantity' }))
    expect(within(dialog).getByRole('button', { name: /Add to order/ })).toHaveTextContent('$36.00') // (14 + 2.5 + 1.5) × 2

    await userEvent.type(within(dialog).getByLabelText(/Anything we should know/), 'No pickles')
    await userEvent.click(within(dialog).getByRole('button', { name: /Add to order/ }))
    expect(onAdd).toHaveBeenCalledWith({ itemId: 'burger', variantId: null, modifierIds: ['mr', 'bacon', 'cheese'], quantity: 2, notes: 'No pickles' })
  })

  it('makes guests pick a size when an item has variants', async () => {
    const onAdd = vi.fn()
    render(<ItemSheet item={wine} currency="USD" onClose={() => {}} onAdd={onAdd} />)
    await userEvent.click(screen.getByLabelText(/Bottle/))
    await userEvent.click(screen.getByRole('button', { name: /Add to order/ }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ variantId: 'bottle' }))
  })
})

describe('shared table orders', () => {
  const order = (seq: number, status: OrderWithItems['status']): OrderWithItems => ({
    id: `o${seq}`, restaurant_id: 'r1', session_id: 's1', table_id: 't1', guest_id: 'g2', order_number: 1040 + seq, session_seq: seq,
    status, notes: null, currency: 'USD', subtotal_minor: 1400, inclusive_tax_minor: 0, exclusive_tax_minor: 140, total_minor: 1540, item_count: 1,
    placed_at: '2026-10-02T20:42:00Z', accepted_at: null, preparing_at: null, ready_at: null, delivered_at: null, cancelled_at: null, cancel_reason: null,
    created_at: '2026-10-02T20:42:00Z', updated_at: '2026-10-02T20:42:00Z',
    order_items: [{
      id: 'l1', order_id: `o${seq}`, restaurant_id: 'r1', session_id: 's1', position: 1, menu_item_id: 'burger', variant_id: null, name: 'Burger', variant_name: null,
      modifiers: [{ id: 'mr', group: 'Cook', name: 'Medium rare', price_delta_minor: 0 }], applied_taxes: [], unit_price_minor: 1400, quantity: 1, line_total_minor: 1400,
      notes: null, is_voided: false, void_reason: null, voided_at: null, voided_by: null, created_at: '', updated_at: '',
    }],
  })

  it('shows which guest ordered each round and its live status', () => {
    render(
      <MemoryRouter>
        <GuestOrderCard order={order(2, 'preparing')} currency="USD" whoLabel="Guest 2" timeZone="UTC" />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Round 2/)).toBeInTheDocument()
    expect(screen.getByText(/Guest 2, /)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Status: Preparing' })).toBeInTheDocument()
    expect(screen.getByText('$15.40')).toBeInTheDocument()
  })
})
