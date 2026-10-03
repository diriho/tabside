import { unwrap } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { ItemAvailability, MenuCategory, MenuItem, MenuVariant, Modifier, ModifierGroup, Tax } from '@/types/domain'
import type { TablesInsert, TablesUpdate } from '@/types/database'

export interface MenuGroupWithModifiers extends ModifierGroup {
  menu_modifiers: Modifier[]
}

export interface FullMenuItem extends MenuItem {
  menu_item_variants: MenuVariant[]
  menu_modifier_groups: MenuGroupWithModifiers[]
}

export interface Menu {
  categories: MenuCategory[]
  items: FullMenuItem[]
  taxes: Tax[]
  taxCategories: Array<{ tax_id: string; category_id: string }>
  taxItems: Array<{ tax_id: string; item_id: string }>
}

/** Everything needed to render a menu and price a cart. RLS decides what's visible. */
export async function getMenu(restaurantId: string): Promise<Menu> {
  const [categories, items, taxes, taxCategories, taxItems] = await Promise.all([
    supabase.from('menu_categories').select('*').eq('restaurant_id', restaurantId).order('sort_order').order('name'),
    supabase
      .from('menu_items')
      .select('*, menu_item_variants(*), menu_modifier_groups(*, menu_modifiers(*))')
      .eq('restaurant_id', restaurantId)
      .is('archived_at', null)
      .order('sort_order')
      .order('name'),
    supabase.from('taxes').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
    supabase.from('tax_categories').select('tax_id, category_id').eq('restaurant_id', restaurantId),
    supabase.from('tax_items').select('tax_id, item_id').eq('restaurant_id', restaurantId),
  ])
  const sortedItems = (unwrap(items) as FullMenuItem[]).map((item) => ({
    ...item,
    menu_item_variants: [...item.menu_item_variants].sort((a, b) => a.sort_order - b.sort_order),
    menu_modifier_groups: [...item.menu_modifier_groups]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((g) => ({ ...g, menu_modifiers: [...g.menu_modifiers].sort((a, b) => a.sort_order - b.sort_order) })),
  }))
  return {
    categories: unwrap(categories),
    items: sortedItems,
    taxes: unwrap(taxes),
    taxCategories: unwrap(taxCategories),
    taxItems: unwrap(taxItems),
  }
}

// ─── Manager writes (RLS: manager only) ───────────────────────────────────────

export async function saveCategory(input: TablesInsert<'menu_categories'> & { id?: string }) {
  const { id, ...rest } = input
  if (id) return unwrap(await supabase.from('menu_categories').update(rest).eq('id', id).select('*').single())
  return unwrap(await supabase.from('menu_categories').insert(rest).select('*').single())
}

export async function deleteCategory(id: string) {
  unwrap(await supabase.from('menu_categories').delete().eq('id', id))
}

export async function saveItem(input: TablesInsert<'menu_items'> & { id?: string }) {
  const { id, ...rest } = input
  if (id) return unwrap(await supabase.from('menu_items').update(rest).eq('id', id).select('*').single())
  return unwrap(await supabase.from('menu_items').insert(rest).select('*').single())
}

/** Soft delete: past orders keep their reference and snapshot. */
export async function archiveItem(id: string) {
  unwrap(await supabase.from('menu_items').update({ archived_at: new Date().toISOString() }).eq('id', id))
}

export async function reorder(table: 'menu_categories' | 'menu_items', ids: string[]) {
  await Promise.all(ids.map((id, i) => supabase.from(table).update({ sort_order: i + 1 }).eq('id', id)))
}

export async function replaceVariants(restaurantId: string, itemId: string, variants: Array<Pick<MenuVariant, 'name' | 'price_minor' | 'is_available'> & { id?: string }>) {
  const existing = unwrap(await supabase.from('menu_item_variants').select('id').eq('item_id', itemId))
  const keep = new Set(variants.map((v) => v.id).filter(Boolean))
  const remove = existing.filter((e) => !keep.has(e.id)).map((e) => e.id)
  if (remove.length) unwrap(await supabase.from('menu_item_variants').delete().in('id', remove))
  for (const [i, v] of variants.entries()) {
    const row = { restaurant_id: restaurantId, item_id: itemId, name: v.name, price_minor: v.price_minor, is_available: v.is_available, sort_order: i + 1 }
    if (v.id) unwrap(await supabase.from('menu_item_variants').update(row).eq('id', v.id))
    else unwrap(await supabase.from('menu_item_variants').insert(row))
  }
}

export interface ModifierGroupDraft {
  id?: string
  name: string
  min_select: number
  max_select: number
  modifiers: Array<{ id?: string; name: string; price_delta_minor: number; is_available: boolean }>
}

export async function replaceModifierGroups(restaurantId: string, itemId: string, groups: ModifierGroupDraft[]) {
  const existing = unwrap(await supabase.from('menu_modifier_groups').select('id').eq('item_id', itemId))
  const keep = new Set(groups.map((g) => g.id).filter(Boolean))
  const remove = existing.filter((e) => !keep.has(e.id)).map((e) => e.id)
  if (remove.length) unwrap(await supabase.from('menu_modifier_groups').delete().in('id', remove))

  for (const [gi, g] of groups.entries()) {
    const groupRow = { restaurant_id: restaurantId, item_id: itemId, name: g.name, min_select: g.min_select, max_select: g.max_select, sort_order: gi + 1 }
    const groupId = g.id
      ? (unwrap(await supabase.from('menu_modifier_groups').update(groupRow).eq('id', g.id).select('id').single())).id
      : (unwrap(await supabase.from('menu_modifier_groups').insert(groupRow).select('id').single())).id

    const existingMods = unwrap(await supabase.from('menu_modifiers').select('id').eq('group_id', groupId))
    const keepMods = new Set(g.modifiers.map((m) => m.id).filter(Boolean))
    const removeMods = existingMods.filter((e) => !keepMods.has(e.id)).map((e) => e.id)
    if (removeMods.length) unwrap(await supabase.from('menu_modifiers').delete().in('id', removeMods))
    for (const [mi, m] of g.modifiers.entries()) {
      const modRow = { restaurant_id: restaurantId, group_id: groupId, name: m.name, price_delta_minor: m.price_delta_minor, is_available: m.is_available, sort_order: mi + 1 }
      if (m.id) unwrap(await supabase.from('menu_modifiers').update(modRow).eq('id', m.id))
      else unwrap(await supabase.from('menu_modifiers').insert(modRow))
    }
  }
}

export async function setAvailability(itemId: string, availability: ItemAvailability) {
  return unwrap(await supabase.rpc('set_item_availability', { p_item_id: itemId, p_availability: availability }))
}

export async function reportUnavailable(itemId: string, note?: string) {
  unwrap(await supabase.rpc('report_item_unavailable', { p_item_id: itemId, p_note: note }))
}

// ─── Taxes ────────────────────────────────────────────────────────────────────

export async function saveTax(
  restaurantId: string,
  input: { id?: string; name: string; rate_bps: number; is_inclusive: boolean; scope: 'all' | 'categories' | 'items'; is_active: boolean; categoryIds: string[]; itemIds: string[] },
) {
  const row: TablesUpdate<'taxes'> = { name: input.name, rate_bps: input.rate_bps, is_inclusive: input.is_inclusive, scope: input.scope, is_active: input.is_active }
  const tax = input.id
    ? unwrap(await supabase.from('taxes').update(row).eq('id', input.id).select('*').single())
    : unwrap(await supabase.from('taxes').insert({ ...row, restaurant_id: restaurantId, name: input.name, rate_bps: input.rate_bps }).select('*').single())

  unwrap(await supabase.from('tax_categories').delete().eq('tax_id', tax.id))
  unwrap(await supabase.from('tax_items').delete().eq('tax_id', tax.id))
  if (input.scope === 'categories' && input.categoryIds.length) {
    unwrap(await supabase.from('tax_categories').insert(input.categoryIds.map((category_id) => ({ tax_id: tax.id, category_id, restaurant_id: restaurantId }))))
  }
  if (input.scope === 'items' && input.itemIds.length) {
    unwrap(await supabase.from('tax_items').insert(input.itemIds.map((item_id) => ({ tax_id: tax.id, item_id, restaurant_id: restaurantId }))))
  }
  return tax
}

export async function deleteTax(id: string) {
  unwrap(await supabase.from('taxes').delete().eq('id', id))
}
