-- TABSide security: Row Level Security, column privileges, realtime publication, storage.
-- Principle: clients may READ what their role allows; WRITES that carry business rules
-- (orders, statuses, payments, requests, moderation) only happen through RPCs.

-- ─────────────────────────────────────────────────────────────────────────────
-- Enable RLS everywhere
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'currencies', 'profiles', 'restaurants', 'staff_members', 'restaurant_review_settings',
    'restaurant_tables', 'table_sessions', 'session_guests', 'menu_categories', 'menu_items',
    'menu_item_variants', 'menu_modifier_groups', 'menu_modifiers', 'taxes', 'tax_categories',
    'tax_items', 'orders', 'order_items', 'order_taxes', 'order_status_history', 'table_requests',
    'payments', 'reviews', 'availability_reports', 'notifications', 'notification_reads'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- RPC-only tables: clients never write directly (defense in depth on top of RLS).
revoke insert, update, delete on
  public.table_sessions, public.session_guests, public.orders, public.order_items, public.order_taxes,
  public.order_status_history, public.table_requests, public.payments, public.reviews,
  public.availability_reports, public.notifications, public.currencies, public.restaurant_review_settings
from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Reference & identity
-- ─────────────────────────────────────────────────────────────────────────────
create policy currencies_read on public.currencies for select to anon, authenticated using (true);

create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, delete on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Restaurants
-- ─────────────────────────────────────────────────────────────────────────────
create policy restaurants_public_read on public.restaurants for select to anon, authenticated
  using (deleted_at is null or public.is_staff(id));
create policy restaurants_manager_update on public.restaurants for update to authenticated
  using (public.is_staff(id, array['manager']::public.staff_role[]))
  with check (public.is_staff(id, array['manager']::public.staff_role[]));
-- Creation goes through create_restaurant(); status/deletion through their RPCs.
revoke insert, delete, update on public.restaurants from authenticated;
grant update (
  name, tagline, description, logo_url, hero_image_url, gallery_urls, address, phone, email,
  website_url, instagram_handle, opening_hours, timezone, currency, menu_mode, menu_pdf_url, ordering_enabled
) on public.restaurants to authenticated;

create policy review_settings_read on public.restaurant_review_settings for select to anon, authenticated
  using (public.restaurant_is_public(restaurant_id) or public.is_staff(restaurant_id));
create policy review_settings_manager_update on public.restaurant_review_settings for update to authenticated
  using (public.is_staff(restaurant_id, array['manager']::public.staff_role[]))
  with check (public.is_staff(restaurant_id, array['manager']::public.staff_role[]));
grant update (display_mode) on public.restaurant_review_settings to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Staff
-- ─────────────────────────────────────────────────────────────────────────────
create policy staff_read on public.staff_members for select to authenticated
  using (user_id = auth.uid() or public.is_staff(restaurant_id));
create policy staff_manager_update on public.staff_members for update to authenticated
  using (public.is_staff(restaurant_id, array['manager']::public.staff_role[]))
  with check (public.is_staff(restaurant_id, array['manager']::public.staff_role[]));
-- Accounts are created by the Node API (service role) after verifying the caller is a manager.
revoke insert, delete, update on public.staff_members from authenticated;
grant update (role, display_name, is_active) on public.staff_members to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Physical tables & sessions
-- ─────────────────────────────────────────────────────────────────────────────
create policy tables_read on public.restaurant_tables for select to anon, authenticated
  using ((archived_at is null and public.restaurant_is_public(restaurant_id)) or public.is_staff(restaurant_id));
create policy tables_manager_insert on public.restaurant_tables for insert to authenticated
  with check (public.is_staff(restaurant_id, array['manager']::public.staff_role[]));
create policy tables_manager_update on public.restaurant_tables for update to authenticated
  using (public.is_staff(restaurant_id, array['manager']::public.staff_role[]))
  with check (public.is_staff(restaurant_id, array['manager']::public.staff_role[]));
create policy tables_manager_delete on public.restaurant_tables for delete to authenticated
  using (public.is_staff(restaurant_id, array['manager']::public.staff_role[]));

create policy sessions_read on public.table_sessions for select to authenticated
  using (public.is_session_guest(id) or public.is_staff(restaurant_id));
create policy session_guests_read on public.session_guests for select to authenticated
  using (public.is_session_guest(session_id) or public.is_staff(restaurant_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- Menu & taxes: public read (minus hidden/archived), manager write
-- ─────────────────────────────────────────────────────────────────────────────
create policy categories_read on public.menu_categories for select to anon, authenticated
  using ((is_active and public.restaurant_is_public(restaurant_id)) or public.is_staff(restaurant_id));
create policy items_read on public.menu_items for select to anon, authenticated
  using ((archived_at is null and availability <> 'hidden' and public.restaurant_is_public(restaurant_id))
         or public.is_staff(restaurant_id));
create policy variants_read on public.menu_item_variants for select to anon, authenticated
  using (public.restaurant_is_public(restaurant_id) or public.is_staff(restaurant_id));
create policy modifier_groups_read on public.menu_modifier_groups for select to anon, authenticated
  using (public.restaurant_is_public(restaurant_id) or public.is_staff(restaurant_id));
create policy modifiers_read on public.menu_modifiers for select to anon, authenticated
  using (public.restaurant_is_public(restaurant_id) or public.is_staff(restaurant_id));
create policy taxes_read on public.taxes for select to anon, authenticated
  using ((is_active and public.restaurant_is_public(restaurant_id)) or public.is_staff(restaurant_id));
create policy tax_categories_read on public.tax_categories for select to anon, authenticated
  using (public.restaurant_is_public(restaurant_id) or public.is_staff(restaurant_id));
create policy tax_items_read on public.tax_items for select to anon, authenticated
  using (public.restaurant_is_public(restaurant_id) or public.is_staff(restaurant_id));

do $$
declare
  t text;
begin
  foreach t in array array[
    'menu_categories', 'menu_items', 'menu_item_variants', 'menu_modifier_groups', 'menu_modifiers',
    'taxes', 'tax_categories', 'tax_items'
  ] loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_staff(restaurant_id, array[''manager'']::public.staff_role[]))',
      t || '_manager_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_staff(restaurant_id, array[''manager'']::public.staff_role[])) with check (public.is_staff(restaurant_id, array[''manager'']::public.staff_role[]))',
      t || '_manager_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_staff(restaurant_id, array[''manager'']::public.staff_role[]))',
      t || '_manager_delete', t);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Orders & money: guests see their own table's tab; staff see their restaurant
-- ─────────────────────────────────────────────────────────────────────────────
create policy orders_read on public.orders for select to authenticated
  using (public.is_session_guest(session_id) or public.is_staff(restaurant_id));
create policy order_items_read on public.order_items for select to authenticated
  using (public.is_session_guest(session_id) or public.is_staff(restaurant_id));
create policy order_taxes_read on public.order_taxes for select to authenticated
  using (public.is_staff(restaurant_id) or exists (
    select 1 from public.orders o where o.id = order_id and public.is_session_guest(o.session_id)));
create policy order_history_read on public.order_status_history for select to authenticated
  using (public.is_staff(restaurant_id) or exists (
    select 1 from public.orders o where o.id = order_id and public.is_session_guest(o.session_id)));
create policy requests_read on public.table_requests for select to authenticated
  using (public.is_session_guest(session_id) or public.is_staff(restaurant_id));
create policy payments_read on public.payments for select to authenticated
  using (public.is_session_guest(session_id) or public.is_staff(restaurant_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- Reviews: public sees visible ones (per the manager's display mode); authors see their own
-- ─────────────────────────────────────────────────────────────────────────────
create policy reviews_public_read on public.reviews for select to anon, authenticated
  using (
    (
      not is_hidden
      and public.restaurant_is_public(restaurant_id)
      and (is_featured or exists (
        select 1 from public.restaurant_review_settings s
        where s.restaurant_id = reviews.restaurant_id and s.display_mode = 'all_visible'))
    )
    or user_id = auth.uid()
    or public.is_staff(restaurant_id, array['manager']::public.staff_role[])
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Operations
-- ─────────────────────────────────────────────────────────────────────────────
create policy availability_reports_read on public.availability_reports for select to authenticated
  using (public.is_staff(restaurant_id));

create policy notifications_read on public.notifications for select to authenticated
  using (
    (audience = 'session' and public.is_session_guest(session_id))
    or (audience = 'staff' and public.is_staff(restaurant_id) and (
          recipient_roles is null
          or public.my_staff_role(restaurant_id) = 'manager'
          or public.my_staff_role(restaurant_id) = any (recipient_roles)))
  );

create policy notification_reads_own_read on public.notification_reads for select to authenticated
  using (user_id = auth.uid());
create policy notification_reads_own_insert on public.notification_reads for insert to authenticated
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime
-- ─────────────────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table
  public.orders, public.order_items, public.table_sessions, public.session_guests,
  public.table_requests, public.payments, public.menu_items, public.notifications,
  public.availability_reports, public.restaurant_tables, public.reviews;

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage: public media bucket; managers write under "<restaurant_id>/..."
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('restaurant-media', 'restaurant-media', true, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/svg+xml', 'application/pdf'])
on conflict (id) do nothing;

create or replace function public.storage_restaurant_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

create policy media_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'restaurant-media');
create policy media_manager_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'restaurant-media'
              and public.is_staff(public.storage_restaurant_id(name), array['manager']::public.staff_role[]));
create policy media_manager_update on storage.objects for update to authenticated
  using (bucket_id = 'restaurant-media'
         and public.is_staff(public.storage_restaurant_id(name), array['manager']::public.staff_role[]));
create policy media_manager_delete on storage.objects for delete to authenticated
  using (bucket_id = 'restaurant-media'
         and public.is_staff(public.storage_restaurant_id(name), array['manager']::public.staff_role[]));
