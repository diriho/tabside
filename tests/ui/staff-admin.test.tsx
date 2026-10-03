import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/hooks/useToast'
import type { KitchenOrder } from '@/services/operations'
import { menu } from './fixtures'

const setOrderStatus = vi.fn().mockResolvedValue({})
vi.mock('@/services/operations', () => ({
  setOrderStatus: (...args: unknown[]) => setOrderStatus(...args),
  voidOrderItem: vi.fn(),
}))

const saveItem = vi.fn().mockImplementation(async (row: Record<string, unknown>) => ({ ...row, id: 'new-item', name: row.name }))
const replaceVariants = vi.fn().mockResolvedValue(undefined)
const replaceModifierGroups = vi.fn().mockResolvedValue(undefined)
vi.mock('@/services/menu', () => ({
  saveItem: (...a: unknown[]) => saveItem(...a),
  replaceVariants: (...a: unknown[]) => replaceVariants(...a),
  replaceModifierGroups: (...a: unknown[]) => replaceModifierGroups(...a),
  archiveItem: vi.fn(),
}))
vi.mock('@/services/restaurants', () => ({ uploadMedia: vi.fn() }))

const { KitchenTicket } = await import('@/features/staff/KitchenTicket')
const { ItemEditor } = await import('@/features/admin/menu/ItemEditor')

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  )
}

const ticket = (status: KitchenOrder['status']): KitchenOrder => ({
  id: 'o1', restaurant_id: 'r1', session_id: 's1', table_id: 't12', guest_id: 'g1', order_number: 1042, session_seq: 1, status,
  notes: 'Birthday!', currency: 'USD', subtotal_minor: 0, inclusive_tax_minor: 0, exclusive_tax_minor: 0, total_minor: 0, item_count: 6,
  placed_at: new Date(Date.now() - 12 * 60000).toISOString(), accepted_at: null, preparing_at: null, ready_at: null, delivered_at: null,
  cancelled_at: null, cancel_reason: null, created_at: '', updated_at: '',
  restaurant_tables: { label: '12' },
  table_sessions: { party_size: 4, guest_count: 3 },
  session_guests: { guest_number: 2, display_name: null },
  order_items: [
    { id: 'a', order_id: 'o1', restaurant_id: 'r1', session_id: 's1', position: 1, menu_item_id: 'b', variant_id: null, name: 'Burger', variant_name: null, modifiers: [], applied_taxes: [], unit_price_minor: 1400, quantity: 2, line_total_minor: 2800, notes: null, is_voided: false, void_reason: null, voided_at: null, voided_by: null, created_at: '', updated_at: '' },
    { id: 'b', order_id: 'o1', restaurant_id: 'r1', session_id: 's1', position: 2, menu_item_id: 'p', variant_id: null, name: 'Pasta', variant_name: null, modifiers: [], applied_taxes: [], unit_price_minor: 1650, quantity: 1, line_total_minor: 1650, notes: null, is_voided: false, void_reason: null, voided_at: null, voided_by: null, created_at: '', updated_at: '' },
    { id: 'c', order_id: 'o1', restaurant_id: 'r1', session_id: 's1', position: 3, menu_item_id: 'c', variant_id: null, name: 'Coke', variant_name: null, modifiers: [], applied_taxes: [], unit_price_minor: 300, quantity: 3, line_total_minor: 900, notes: null, is_voided: false, void_reason: null, voided_at: null, voided_by: null, created_at: '', updated_at: '' },
  ],
})

describe('kitchen ticket', () => {
  it('shows table, party, order number, items and time, and advances the status', async () => {
    wrap(<KitchenTicket order={ticket('pending')} restaurantId="r1" role="kitchen" now={Date.now()} currency="USD" timeZone="UTC" />)
    const card = screen.getByRole('article', { name: 'Order 1042, table 12' })
    expect(within(card).getByLabelText('Table 12')).toBeInTheDocument()
    expect(within(card).getByText('#1042')).toBeInTheDocument()
    expect(within(card).getByText('Guest 2')).toBeInTheDocument()
    expect(within(card).getByText('12 min')).toBeInTheDocument()
    expect(within(card).getByText('Burger')).toBeInTheDocument()
    expect(within(card).getByText('“Birthday!”')).toBeInTheDocument()

    await userEvent.click(within(card).getByRole('button', { name: 'Accept' }))
    expect(setOrderStatus).toHaveBeenCalledWith('o1', 'accepted')
  })

  it('offers “Mark ready” while preparing, and leaves delivery to servers', async () => {
    const { unmount } = wrap(<KitchenTicket order={ticket('preparing')} restaurantId="r1" role="kitchen" now={Date.now()} currency="USD" timeZone="UTC" />)
    await userEvent.click(screen.getByRole('button', { name: 'Mark ready' }))
    expect(setOrderStatus).toHaveBeenLastCalledWith('o1', 'ready')
    unmount()

    wrap(<KitchenTicket order={ticket('ready')} restaurantId="r1" role="kitchen" now={Date.now()} currency="USD" timeZone="UTC" />)
    expect(screen.getByText('Waiting for a server')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delivered' })).not.toBeInTheDocument()
  })
})

describe('admin menu creation', () => {
  it('creates an item with a price in minor units, plus sizes', async () => {
    wrap(<ItemEditor open item={null} defaultCategoryId="food" menu={menu} restaurantId="r1" currency="USD" onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'New menu item' })

    await userEvent.type(within(dialog).getByLabelText('Name'), 'Tiramisu')
    await userEvent.type(within(dialog).getByLabelText('Price'), '8.50')
    await userEvent.click(within(dialog).getByRole('button', { name: 'vegetarian' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add item' }))

    await waitFor(() => expect(saveItem).toHaveBeenCalled())
    expect(saveItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Tiramisu', price_minor: 850, category_id: 'food', tags: ['vegetarian'], restaurant_id: 'r1' }))
    expect(replaceVariants).toHaveBeenCalledWith('r1', 'new-item', [])
  })

  it('refuses an invalid price', async () => {
    wrap(<ItemEditor open item={null} defaultCategoryId="food" menu={menu} restaurantId="r1" currency="USD" onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'New menu item' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Mystery')
    await userEvent.type(within(dialog).getByLabelText('Price'), '8.505')
    expect(within(dialog).getByRole('button', { name: 'Add item' })).toBeDisabled()
    expect(within(dialog).getByText('Enter a valid price.')).toBeInTheDocument()
  })
})
