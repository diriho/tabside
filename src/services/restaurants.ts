import { unwrap, unwrapMaybe } from '@/lib/api'
import { randomId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import type { Restaurant, Review, TableEntry } from '@/types/domain'
import type { TablesUpdate } from '@/types/database'

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  return unwrapMaybe(await supabase.from('restaurants').select('*').eq('slug', slug).is('deleted_at', null).maybeSingle())
}

export async function getRestaurant(id: string): Promise<Restaurant> {
  return unwrap(await supabase.from('restaurants').select('*').eq('id', id).single())
}

export async function getTableEntry(tableId: string): Promise<TableEntry | null> {
  return unwrapMaybe(await supabase.rpc('get_table_entry', { p_table_id: tableId })) as unknown as TableEntry | null
}

export async function listPublicReviews(restaurantId: string, limit = 6): Promise<Review[]> {
  return unwrap(
    await supabase
      .from('reviews')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_hidden', false)
      .not('body', 'is', null)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
  )
}

export async function updateRestaurant(id: string, patch: TablesUpdate<'restaurants'>): Promise<Restaurant> {
  return unwrap(await supabase.from('restaurants').update(patch).eq('id', id).select('*').single())
}

export async function createRestaurant(input: { name: string; slug: string; currency: string; timezone: string; displayName?: string }) {
  return unwrap(
    await supabase.rpc('create_restaurant', {
      p_name: input.name,
      p_slug: input.slug,
      p_currency: input.currency,
      p_timezone: input.timezone,
      p_display_name: input.displayName,
    }),
  ) as unknown as Restaurant
}

export async function setRestaurantStatus(id: string, status: 'active' | 'closed') {
  return unwrap(await supabase.rpc('set_restaurant_status', { p_restaurant_id: id, p_status: status }))
}

export async function deleteRestaurant(id: string, confirmSlug: string) {
  unwrap(await supabase.rpc('delete_restaurant', { p_restaurant_id: id, p_confirm_slug: confirmSlug }))
}

export async function listCurrencies() {
  return unwrap(await supabase.from('currencies').select('code, name, exponent').order('code'))
}

export async function getReviewSettings(restaurantId: string) {
  return unwrap(await supabase.from('restaurant_review_settings').select('*').eq('restaurant_id', restaurantId).single())
}

export async function updateReviewSettings(restaurantId: string, displayMode: 'all_visible' | 'featured_only') {
  return unwrap(
    await supabase.from('restaurant_review_settings').update({ display_mode: displayMode }).eq('restaurant_id', restaurantId).select('*').single(),
  )
}

export async function uploadMedia(restaurantId: string, file: File, folder: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const path = `${restaurantId}/${folder}/${randomId()}.${ext}`
  unwrap(await supabase.storage.from('restaurant-media').upload(path, file, { cacheControl: '31536000', upsert: false }))
  return supabase.storage.from('restaurant-media').getPublicUrl(path).data.publicUrl
}
