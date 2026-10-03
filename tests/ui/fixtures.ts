import type { FullMenuItem, Menu } from '@/services/menu'

const base = { restaurant_id: 'r1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

export function item(partial: Partial<FullMenuItem> & { id: string; name: string; price_minor: number }): FullMenuItem {
  return {
    ...base,
    category_id: 'food',
    description: null,
    image_url: null,
    availability: 'available',
    tags: [],
    sort_order: 0,
    archived_at: null,
    menu_item_variants: [],
    menu_modifier_groups: [],
    ...partial,
  }
}

export const burger = item({
  id: 'burger',
  name: 'Burger',
  price_minor: 1400,
  menu_modifier_groups: [
    {
      ...base, id: 'cook', item_id: 'burger', name: 'Cook', min_select: 1, max_select: 1, sort_order: 1,
      menu_modifiers: [
        { ...base, id: 'mr', group_id: 'cook', name: 'Medium rare', price_delta_minor: 0, is_available: true, sort_order: 1 },
        { ...base, id: 'wd', group_id: 'cook', name: 'Well done', price_delta_minor: 0, is_available: true, sort_order: 2 },
      ],
    },
    {
      ...base, id: 'addons', item_id: 'burger', name: 'Add-ons', min_select: 0, max_select: 2, sort_order: 2,
      menu_modifiers: [
        { ...base, id: 'bacon', group_id: 'addons', name: 'Bacon', price_delta_minor: 250, is_available: true, sort_order: 1 },
        { ...base, id: 'cheese', group_id: 'addons', name: 'Cheese', price_delta_minor: 150, is_available: true, sort_order: 2 },
        { ...base, id: 'egg', group_id: 'addons', name: 'Egg', price_delta_minor: 100, is_available: true, sort_order: 3 },
      ],
    },
  ],
})
export const fries = item({ id: 'fries', name: 'Fries', price_minor: 550 })
export const beer = item({ id: 'beer', name: 'Beer', price_minor: 800, category_id: 'drinks' })
export const cake = item({ id: 'cake', name: 'Cake', price_minor: 700, category_id: 'desserts', availability: 'sold_out' })
export const wine = item({
  id: 'wine', name: 'House Red', price_minor: 1000, category_id: 'drinks',
  menu_item_variants: [
    { ...base, id: 'glass', item_id: 'wine', name: 'Glass', price_minor: 1000, is_available: true, sort_order: 1 },
    { ...base, id: 'bottle', item_id: 'wine', name: 'Bottle', price_minor: 3800, is_available: true, sort_order: 2 },
  ],
})

export const menu: Menu = {
  categories: [
    { ...base, id: 'food', name: 'Food', description: 'From the grill', sort_order: 1, is_active: true },
    { ...base, id: 'drinks', name: 'Drinks', description: null, sort_order: 2, is_active: true },
    { ...base, id: 'desserts', name: 'Desserts', description: null, sort_order: 3, is_active: true },
  ],
  items: [burger, fries, beer, wine, cake],
  taxes: [
    { ...base, id: 'sales', name: 'Sales tax', rate_bps: 1000, is_inclusive: false, scope: 'all', is_active: true, sort_order: 1 },
    { ...base, id: 'liquor', name: 'Liquor tax', rate_bps: 500, is_inclusive: false, scope: 'categories', is_active: true, sort_order: 2 },
  ],
  taxCategories: [{ tax_id: 'liquor', category_id: 'drinks' }],
  taxItems: [],
}
