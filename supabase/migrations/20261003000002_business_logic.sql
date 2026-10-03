-- TABSide business logic: access helpers, money/tax engine, lifecycle triggers, RPCs.
-- Every SECURITY DEFINER function pins search_path and derives identity from auth.uid();
-- client-supplied ids are only ever used to look rows up, never trusted for ownership.
-- Errors are raised with stable machine-readable messages (e.g. 'item_unavailable') that
-- the client maps to friendly copy.

-- ─────────────────────────────────────────────────────────────────────────────
-- Access helpers
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_anon()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

create or replace function public.is_staff(p_restaurant_id uuid, p_roles public.staff_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and not public.is_anon()
    and exists (
      select 1
      from public.staff_members s
      where s.restaurant_id = p_restaurant_id
        and s.user_id = auth.uid()
        and s.is_active
        and (p_roles is null or s.role = any (p_roles))
    );
$$;

create or replace function public.my_staff_role(p_restaurant_id uuid)
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
  from public.staff_members s
  where s.restaurant_id = p_restaurant_id and s.user_id = auth.uid() and s.is_active
    and not public.is_anon();
$$;

create or replace function public.is_session_guest(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.session_guests g
    where g.session_id = p_session_id and g.user_id = auth.uid()
  );
$$;

create or replace function public.restaurant_is_public(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.restaurants r where r.id = p_restaurant_id and r.deleted_at is null
  );
$$;

create or replace function public._require_staff(p_restaurant_id uuid, p_roles public.staff_role[] default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff(p_restaurant_id, p_roles) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Money & tax engine (mirrored exactly in src/lib/money/tax.ts)
-- ─────────────────────────────────────────────────────────────────────────────
-- Half-up integer division for non-negative operands.
create or replace function public.div_round(n bigint, d bigint)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$
  select (2 * n + d) / (2 * d);
$$;

-- Taxes for one order line. p_taxes is an ordered array of
-- {tax_id, name, rate_bps, is_inclusive}. Returns {net_minor, taxes:[...+amount_minor]}.
create or replace function public.calc_line_taxes(p_line_total bigint, p_taxes jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_inc_rate bigint := 0;
  v_inc_count integer := 0;
  v_inc_seen integer := 0;
  v_net bigint;
  v_inc_total bigint;
  v_allocated bigint := 0;
  v_tax jsonb;
  v_amount bigint;
  v_out jsonb := '[]'::jsonb;
begin
  select coalesce(sum((t.value ->> 'rate_bps')::bigint), 0), count(*)
    into v_inc_rate, v_inc_count
  from jsonb_array_elements(coalesce(p_taxes, '[]'::jsonb)) t
  where (t.value ->> 'is_inclusive')::boolean;

  v_net := case when v_inc_rate = 0 then p_line_total
                else public.div_round(p_line_total * 10000, 10000 + v_inc_rate) end;
  v_inc_total := p_line_total - v_net;

  for v_tax in
    select t.value from jsonb_array_elements(coalesce(p_taxes, '[]'::jsonb)) with ordinality t order by t.ordinality
  loop
    if (v_tax ->> 'is_inclusive')::boolean then
      v_inc_seen := v_inc_seen + 1;
      if v_inc_seen = v_inc_count then
        -- last inclusive tax absorbs the rounding remainder so shares sum to (line - net)
        v_amount := greatest(v_inc_total - v_allocated, 0);
      else
        v_amount := public.div_round(v_net * (v_tax ->> 'rate_bps')::bigint, 10000);
        v_allocated := v_allocated + v_amount;
      end if;
    else
      v_amount := public.div_round(v_net * (v_tax ->> 'rate_bps')::bigint, 10000);
    end if;
    v_out := v_out || jsonb_build_array(v_tax || jsonb_build_object('amount_minor', v_amount));
  end loop;

  return jsonb_build_object('net_minor', v_net, 'taxes', v_out);
end;
$$;

-- Totals for a set of lines: [{line_total_minor, quantity, taxes:[...]}].
create or replace function public.summarize_lines(p_lines jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_subtotal bigint;
  v_items integer;
  v_inc bigint;
  v_exc bigint;
  v_taxes jsonb;
begin
  with lines as (
    select l.value as line, l.ordinality as n
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality l
  ),
  calc as (
    select n, public.calc_line_taxes((line ->> 'line_total_minor')::bigint, coalesce(line -> 'taxes', '[]'::jsonb)) as c
    from lines
  ),
  line_taxes as (
    select calc.n, t.ordinality as tn, t.value as tax
    from calc, jsonb_array_elements(calc.c -> 'taxes') with ordinality t
  ),
  agg as (
    select tax ->> 'tax_id' as tax_id,
           tax ->> 'name' as name,
           (tax ->> 'rate_bps')::integer as rate_bps,
           (tax ->> 'is_inclusive')::boolean as is_inclusive,
           sum((tax ->> 'amount_minor')::bigint) as amount,
           min(n * 1000 + tn) as ord
    from line_taxes
    group by 1, 2, 3, 4
  )
  select
    (select coalesce(sum((line ->> 'line_total_minor')::bigint), 0) from lines),
    (select coalesce(sum((line ->> 'quantity')::integer), 0) from lines),
    (select coalesce(sum(amount), 0) from agg where is_inclusive),
    (select coalesce(sum(amount), 0) from agg where not is_inclusive),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'tax_id', tax_id, 'name', name, 'rate_bps', rate_bps,
               'is_inclusive', is_inclusive, 'amount_minor', amount) order by ord)
      from agg
    ), '[]'::jsonb)
  into v_subtotal, v_items, v_inc, v_exc, v_taxes;

  return jsonb_build_object(
    'subtotal_minor', v_subtotal,
    'item_count', v_items,
    'inclusive_tax_minor', v_inc,
    'exclusive_tax_minor', v_exc,
    'total_minor', v_subtotal + v_exc,
    'taxes', v_taxes
  );
end;
$$;

-- Active taxes that apply to an item, in deterministic order.
create or replace function public._item_taxes(p_restaurant_id uuid, p_item_id uuid, p_category_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'tax_id', t.id, 'name', t.name, 'rate_bps', t.rate_bps, 'is_inclusive', t.is_inclusive)
         order by t.sort_order, t.created_at, t.id), '[]'::jsonb)
  from public.taxes t
  where t.restaurant_id = p_restaurant_id
    and t.is_active
    and t.rate_bps > 0
    and (
      t.scope = 'all'
      or (t.scope = 'categories' and exists (
            select 1 from public.tax_categories tc where tc.tax_id = t.id and tc.category_id = p_category_id))
      or (t.scope = 'items' and exists (
            select 1 from public.tax_items ti where ti.tax_id = t.id and ti.item_id = p_item_id))
    );
$$;

-- Validates requested items against the live menu and prices them from the database.
-- Input: [{menu_item_id, variant_id?, modifier_ids?: uuid[], quantity, notes?}]
create or replace function public._build_order_lines(p_restaurant_id uuid, p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_in jsonb;
  v_item public.menu_items;
  v_variant public.menu_item_variants;
  v_qty integer;
  v_unit bigint;
  v_mod_ids uuid[];
  v_mod_count integer;
  v_mod_total bigint;
  v_mods jsonb;
  v_group record;
  v_lines jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'too_many_lines';
  end if;

  for v_in in select value from jsonb_array_elements(p_items) loop
    begin
      v_qty := (v_in ->> 'quantity')::integer;
    exception when others then
      raise exception 'invalid_quantity';
    end;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'invalid_quantity';
    end if;

    select i.* into v_item
    from public.menu_items i
    where i.id = (v_in ->> 'menu_item_id')::uuid
      and i.restaurant_id = p_restaurant_id
      and i.archived_at is null;
    if not found then
      raise exception 'item_not_found';
    end if;

    if v_item.availability <> 'available'
       or exists (select 1 from public.menu_categories c where c.id = v_item.category_id and not c.is_active) then
      raise exception 'item_unavailable' using detail = v_item.name, hint = v_item.id::text;
    end if;

    -- Variants: when an item has variants, one must be chosen and it sets the base price.
    if exists (select 1 from public.menu_item_variants v where v.item_id = v_item.id) then
      select v.* into v_variant
      from public.menu_item_variants v
      where v.id = nullif(v_in ->> 'variant_id', '')::uuid and v.item_id = v_item.id;
      if not found then
        raise exception 'variant_required' using detail = v_item.name;
      end if;
      if not v_variant.is_available then
        raise exception 'item_unavailable' using detail = v_item.name || ' (' || v_variant.name || ')', hint = v_item.id::text;
      end if;
      v_unit := v_variant.price_minor;
    else
      if nullif(v_in ->> 'variant_id', '') is not null then
        raise exception 'invalid_variant' using detail = v_item.name;
      end if;
      v_variant := null;
      v_unit := v_item.price_minor;
    end if;

    -- Modifiers: must belong to this item, be available, unique, and satisfy group min/max.
    v_mod_ids := coalesce(array(
      select (jsonb_array_elements_text(coalesce(v_in -> 'modifier_ids', '[]'::jsonb)))::uuid
    ), '{}');
    if cardinality(v_mod_ids) <> (select count(distinct m) from unnest(v_mod_ids) m) then
      raise exception 'duplicate_modifier' using detail = v_item.name;
    end if;

    select count(*),
           coalesce(sum(m.price_delta_minor), 0),
           coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'group', g.name, 'name', m.name, 'price_delta_minor', m.price_delta_minor)
             order by g.sort_order, g.name, m.sort_order, m.name), '[]'::jsonb)
      into v_mod_count, v_mod_total, v_mods
    from public.menu_modifiers m
    join public.menu_modifier_groups g on g.id = m.group_id
    where m.id = any (v_mod_ids) and g.item_id = v_item.id and m.is_available;
    if v_mod_count <> cardinality(v_mod_ids) then
      raise exception 'invalid_modifier' using detail = v_item.name;
    end if;

    for v_group in
      select g.name, g.min_select, g.max_select,
             (select count(*) from public.menu_modifiers m where m.group_id = g.id and m.id = any (v_mod_ids)) as n
      from public.menu_modifier_groups g
      where g.item_id = v_item.id
    loop
      if v_group.n < v_group.min_select or v_group.n > v_group.max_select then
        raise exception 'modifier_selection_invalid' using detail = v_item.name || ': ' || v_group.name;
      end if;
    end loop;

    v_unit := v_unit + v_mod_total;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'menu_item_id', v_item.id,
      'variant_id', v_variant.id,
      'name', v_item.name,
      'variant_name', v_variant.name,
      'modifiers', v_mods,
      'unit_price_minor', v_unit,
      'quantity', v_qty,
      'line_total_minor', v_unit * v_qty,
      'notes', nullif(btrim(left(v_in ->> 'notes', 200)), ''),
      'taxes', public._item_taxes(p_restaurant_id, v_item.id, v_item.category_id)
    ));
  end loop;

  return v_lines;
end;
$$;

-- Recalculates an order's totals and tax breakdown from its (non-voided) lines' tax snapshots.
create or replace function public.recompute_order_totals(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lines jsonb;
  v_sum jsonb;
  v_restaurant_id uuid;
begin
  select o.restaurant_id into v_restaurant_id from public.orders o where o.id = p_order_id;

  select jsonb_agg(jsonb_build_object(
           'line_total_minor', oi.line_total_minor,
           'quantity', oi.quantity,
           'taxes', oi.applied_taxes) order by oi.position, oi.id)
    into v_lines
  from public.order_items oi
  where oi.order_id = p_order_id and not oi.is_voided;

  v_sum := public.summarize_lines(coalesce(v_lines, '[]'::jsonb));

  update public.orders set
    subtotal_minor = (v_sum ->> 'subtotal_minor')::bigint,
    inclusive_tax_minor = (v_sum ->> 'inclusive_tax_minor')::bigint,
    exclusive_tax_minor = (v_sum ->> 'exclusive_tax_minor')::bigint,
    total_minor = (v_sum ->> 'total_minor')::bigint,
    item_count = (v_sum ->> 'item_count')::integer
  where id = p_order_id;

  delete from public.order_taxes where order_id = p_order_id;
  insert into public.order_taxes (order_id, restaurant_id, tax_id, name, rate_bps, is_inclusive, amount_minor)
  select p_order_id, v_restaurant_id, nullif(t.value ->> 'tax_id', '')::uuid, t.value ->> 'name',
         (t.value ->> 'rate_bps')::integer, (t.value ->> 'is_inclusive')::boolean,
         (t.value ->> 'amount_minor')::bigint
  from jsonb_array_elements(v_sum -> 'taxes') t;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Notifications
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._notify(
  p_restaurant_id uuid,
  p_audience public.notification_audience,
  p_roles public.staff_role[],
  p_session_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_data jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (restaurant_id, audience, recipient_roles, session_id, type, title, body, data)
  values (p_restaurant_id, p_audience, p_roles, p_session_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb));
$$;

create or replace function public.format_money(p_amount bigint, p_currency text)
returns text
language sql
stable
set search_path = ''
as $$
  select p_currency || ' ' || case
    when c.exponent = 0 then to_char(p_amount, 'FM999G999G999G990')
    else to_char(p_amount::numeric / power(10, c.exponent), 'FM999G999G999G990.' || repeat('0', c.exponent))
  end
  from public.currencies c where c.code = p_currency;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- Profiles for real (non-anonymous) accounts.
create or replace function public._handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;
  insert into public.profiles (id, full_name, email)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public._handle_new_user();

-- Every restaurant gets review settings.
create or replace function public._restaurant_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.restaurant_review_settings (restaurant_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger restaurant_defaults
  after insert on public.restaurants
  for each row execute function public._restaurant_defaults();

-- Currency cannot change while tabs with orders are open (would mix currencies on one bill).
create or replace function public._restaurant_currency_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency and exists (
    select 1 from public.table_sessions s
    where s.restaurant_id = new.id and s.status in ('open', 'bill_requested', 'paid') and s.order_count > 0
  ) then
    raise exception 'currency_locked_active_tabs';
  end if;
  return new;
end;
$$;

create trigger restaurant_currency_guard
  before update of currency on public.restaurants
  for each row execute function public._restaurant_currency_guard();

-- Never leave a restaurant without an active manager; the owner cannot be demoted or removed.
create or replace function public._staff_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_owner and (new.role <> 'manager' or not new.is_active) then
    raise exception 'owner_protected';
  end if;
  if old.role = 'manager' and old.is_active and (new.role <> 'manager' or not new.is_active)
     and not exists (
       select 1 from public.staff_members s
       where s.restaurant_id = old.restaurant_id and s.id <> old.id and s.role = 'manager' and s.is_active
     ) then
    raise exception 'last_manager';
  end if;
  new.restaurant_id := old.restaurant_id;
  new.user_id := old.user_id;
  new.is_owner := old.is_owner;
  return new;
end;
$$;

create trigger staff_guard
  before update on public.staff_members
  for each row execute function public._staff_guard();

-- Order lifecycle: forward-only (steps may be skipped); cancel from any pre-delivered state.
create or replace function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from = p_to then true
    when p_from in ('delivered', 'cancelled') then false
    when p_to = 'cancelled' then true
    else array_position(array['pending', 'accepted', 'preparing', 'ready', 'delivered']::public.order_status[], p_to)
       > array_position(array['pending', 'accepted', 'preparing', 'ready', 'delivered']::public.order_status[], p_from)
  end;
$$;

create or replace function public._order_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if not public.order_transition_allowed(old.status, new.status) then
    raise exception 'invalid_transition' using detail = old.status || ' -> ' || new.status;
  end if;
  if new.status = 'cancelled' then
    new.cancelled_at := now();
  else
    -- fill timestamps for every step reached, including skipped ones
    if new.status in ('accepted', 'preparing', 'ready', 'delivered') then new.accepted_at := coalesce(new.accepted_at, now()); end if;
    if new.status in ('preparing', 'ready', 'delivered') then new.preparing_at := coalesce(new.preparing_at, now()); end if;
    if new.status in ('ready', 'delivered') then new.ready_at := coalesce(new.ready_at, now()); end if;
    if new.status = 'delivered' then new.delivered_at := coalesce(new.delivered_at, now()); end if;
  end if;
  return new;
end;
$$;

create trigger order_status_guard
  before update of status on public.orders
  for each row execute function public._order_status_guard();

create or replace function public._order_status_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
  v_title text;
  v_body text;
  v_data jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, restaurant_id, from_status, to_status, changed_by)
    values (new.id, new.restaurant_id, null, new.status, auth.uid());
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  insert into public.order_status_history (order_id, restaurant_id, from_status, to_status, changed_by)
  values (new.id, new.restaurant_id, old.status, new.status, auth.uid());

  select t.label into v_label from public.restaurant_tables t where t.id = new.table_id;
  v_data := jsonb_build_object('order_id', new.id, 'order_number', new.order_number,
                               'table_id', new.table_id, 'session_id', new.session_id, 'status', new.status);

  -- Guest-facing update
  v_title := case new.status
    when 'accepted' then 'Order #' || new.order_number || ' accepted'
    when 'preparing' then 'Your order is being prepared'
    when 'ready' then 'Your order is ready'
    when 'delivered' then 'Order #' || new.order_number || ' delivered'
    when 'cancelled' then 'Order #' || new.order_number || ' was cancelled'
  end;
  v_body := case new.status
    when 'accepted' then 'The kitchen has your order.'
    when 'preparing' then 'Order #' || new.order_number || ' is being prepared.'
    when 'ready' then 'Order #' || new.order_number || ' is on its way to your table.'
    when 'delivered' then 'Enjoy your meal!'
    when 'cancelled' then coalesce(new.cancel_reason, 'Please ask your server for details.')
  end;
  if v_title is not null then
    perform public._notify(new.restaurant_id, 'session', null, new.session_id, 'order.' || new.status, v_title, v_body, v_data);
  end if;

  -- Staff-facing update
  if new.status = 'ready' then
    perform public._notify(new.restaurant_id, 'staff', array['waiter']::public.staff_role[], new.session_id,
      'order.ready', 'Order #' || new.order_number || ' ready — Table ' || v_label, 'Ready to serve.', v_data);
  elsif new.status = 'cancelled' then
    perform public._notify(new.restaurant_id, 'staff', null, new.session_id,
      'order.cancelled', 'Order #' || new.order_number || ' cancelled — Table ' || v_label, new.cancel_reason, v_data);
  end if;

  return new;
end;
$$;

create trigger order_status_effects
  after insert or update of status on public.orders
  for each row execute function public._order_status_effects();

-- Rating aggregates: count and sum maintained on restaurants (managers cannot touch ratings).
create or replace function public._review_aggregates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.restaurants set rating_count = rating_count - 1, rating_sum = rating_sum - old.rating
    where id = old.restaurant_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.restaurants set rating_count = rating_count + 1, rating_sum = rating_sum + new.rating
    where id = new.restaurant_id;
  end if;
  return null;
end;
$$;

create trigger review_aggregates
  after insert or delete or update of rating on public.reviews
  for each row execute function public._review_aggregates();

-- ─────────────────────────────────────────────────────────────────────────────
-- Session money
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._session_amounts(p_session_id uuid, out total_minor bigint, out paid_minor bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(o.total_minor)::bigint from public.orders o
              where o.session_id = p_session_id and o.status <> 'cancelled'), 0),
    coalesce((select sum(p.amount_minor)::bigint from public.payments p
              where p.session_id = p_session_id and p.status = 'succeeded'), 0);
$$;

-- Marks a session paid once succeeded payments cover everything ordered.
create or replace function public._settle_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.table_sessions;
  v_amounts record;
  v_label text;
  v_currency text;
begin
  select s.* into v_session from public.table_sessions s where s.id = p_session_id for update;
  if v_session.status not in ('open', 'bill_requested') then
    return v_session.status = 'paid';
  end if;

  select * into v_amounts from public._session_amounts(p_session_id);
  if v_amounts.total_minor = 0 or v_amounts.paid_minor < v_amounts.total_minor then
    return false;
  end if;

  update public.table_sessions set status = 'paid', paid_at = now() where id = p_session_id;
  update public.table_requests set status = 'resolved', resolved_at = now()
  where session_id = p_session_id and type = 'bill' and status <> 'resolved';

  select t.label into v_label from public.restaurant_tables t where t.id = v_session.table_id;
  select r.currency into v_currency from public.restaurants r where r.id = v_session.restaurant_id;

  perform public._notify(v_session.restaurant_id, 'staff', array['waiter']::public.staff_role[], p_session_id,
    'session.paid', 'Table ' || v_label || ' paid',
    public.format_money(v_amounts.paid_minor, v_currency) || ' received.',
    jsonb_build_object('session_id', p_session_id, 'table_id', v_session.table_id));
  perform public._notify(v_session.restaurant_id, 'session', null, p_session_id,
    'session.paid', 'Payment received', 'Thank you! Your table is all settled.',
    jsonb_build_object('session_id', p_session_id));
  return true;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Guest RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- Public preview for the QR landing screen (callable before sign-in).
create or replace function public.get_table_entry(p_table_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'table', jsonb_build_object('id', t.id, 'label', t.label, 'capacity', t.capacity, 'is_active', t.is_active and t.archived_at is null),
    'restaurant', jsonb_build_object(
      'id', r.id, 'slug', r.slug, 'name', r.name, 'tagline', r.tagline, 'logo_url', r.logo_url,
      'hero_image_url', r.hero_image_url, 'currency', r.currency, 'status', r.status,
      'ordering_enabled', r.ordering_enabled, 'rating_count', r.rating_count,
      'rating_avg', case when r.rating_count > 0 then round(r.rating_sum::numeric / r.rating_count, 1) end),
    'active_session', (
      select jsonb_build_object('party_size', s.party_size, 'guest_count', s.guest_count, 'status', s.status,
                                'opened_at', s.opened_at)
      from public.table_sessions s
      where s.table_id = t.id and s.status in ('open', 'bill_requested')
    )
  )
  from public.restaurant_tables t
  join public.restaurants r on r.id = t.restaurant_id
  where t.id = p_table_id and r.deleted_at is null;
$$;

-- Join (or open) the table's single active session. Idempotent per user.
create or replace function public.join_table(p_table_id uuid, p_party_size integer default null, p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_table public.restaurant_tables;
  v_restaurant public.restaurants;
  v_session public.table_sessions;
  v_guest public.session_guests;
  v_is_new boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_party_size is not null and (p_party_size < 1 or p_party_size > 50) then
    raise exception 'invalid_party_size';
  end if;

  -- Lock the physical table: concurrent scans at the same table serialize here.
  select t.* into v_table from public.restaurant_tables t where t.id = p_table_id for update;
  if not found or v_table.archived_at is not null then
    raise exception 'table_not_found';
  end if;
  if not v_table.is_active then
    raise exception 'table_unavailable';
  end if;

  select r.* into v_restaurant from public.restaurants r where r.id = v_table.restaurant_id;
  if v_restaurant.deleted_at is not null or v_restaurant.status <> 'active' then
    raise exception 'restaurant_closed';
  end if;

  select s.* into v_session
  from public.table_sessions s
  where s.table_id = p_table_id and s.status in ('open', 'bill_requested', 'paid');

  -- A settled tab belongs to the previous party: a newcomer starts a fresh tab.
  if found and v_session.status = 'paid'
     and not exists (select 1 from public.session_guests g where g.session_id = v_session.id and g.user_id = v_uid) then
    update public.table_sessions set status = 'closed', closed_at = now() where id = v_session.id;
    v_session := null;
  end if;

  if v_session.id is null then
    insert into public.table_sessions (restaurant_id, table_id, party_size)
    values (v_restaurant.id, v_table.id, coalesce(p_party_size, least(v_table.capacity, 2)))
    returning * into v_session;
    v_is_new := true;
  elsif p_party_size is not null and p_party_size <> v_session.party_size then
    update public.table_sessions set party_size = p_party_size where id = v_session.id returning * into v_session;
  end if;

  select g.* into v_guest from public.session_guests g where g.session_id = v_session.id and g.user_id = v_uid;
  if not found then
    insert into public.session_guests (session_id, restaurant_id, user_id, guest_number, display_name)
    values (
      v_session.id, v_restaurant.id, v_uid,
      (select coalesce(max(g.guest_number), 0) + 1 from public.session_guests g where g.session_id = v_session.id),
      nullif(btrim(left(p_display_name, 40)), '')
    )
    returning * into v_guest;
    update public.table_sessions set guest_count = guest_count + 1 where id = v_session.id returning * into v_session;
  elsif p_display_name is not null then
    update public.session_guests set display_name = nullif(btrim(left(p_display_name, 40)), '')
    where id = v_guest.id returning * into v_guest;
  end if;

  if v_is_new then
    perform public._notify(v_restaurant.id, 'staff', array['waiter']::public.staff_role[], v_session.id,
      'session.opened', 'Table ' || v_table.label || ' seated',
      v_session.party_size || case when v_session.party_size = 1 then ' guest' else ' guests' end,
      jsonb_build_object('session_id', v_session.id, 'table_id', v_table.id));
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'guest_id', v_guest.id,
    'guest_number', v_guest.guest_number,
    'is_new_session', v_is_new,
    'party_size', v_session.party_size,
    'guest_count', v_session.guest_count,
    'table_label', v_table.label,
    'restaurant_slug', v_restaurant.slug
  );
end;
$$;

-- Authoritative price quote for a cart (no side effects).
create or replace function public.quote_order(p_session_id uuid, p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.table_sessions;
  v_lines jsonb;
  v_currency text;
begin
  select s.* into v_session from public.table_sessions s where s.id = p_session_id;
  if not found or not (public.is_session_guest(p_session_id) or public.is_staff(v_session.restaurant_id)) then
    raise exception 'session_not_found';
  end if;
  select r.currency into v_currency from public.restaurants r where r.id = v_session.restaurant_id;
  v_lines := public._build_order_lines(v_session.restaurant_id, p_items);
  return public.summarize_lines(v_lines) || jsonb_build_object('currency', v_currency, 'lines', v_lines);
end;
$$;

-- The only way to create an order. Prices come from the database, never the client.
create or replace function public.place_order(p_session_id uuid, p_items jsonb, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.table_sessions;
  v_guest public.session_guests;
  v_restaurant public.restaurants;
  v_label text;
  v_lines jsonb;
  v_number integer;
  v_seq integer;
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select s.* into v_session from public.table_sessions s where s.id = p_session_id for update;
  if not found then
    raise exception 'session_not_found';
  end if;

  select g.* into v_guest from public.session_guests g where g.session_id = p_session_id and g.user_id = auth.uid();
  if not found then
    raise exception 'not_session_guest' using errcode = '42501';
  end if;
  if v_session.status = 'closed' then
    raise exception 'session_closed';
  end if;

  select r.* into v_restaurant from public.restaurants r where r.id = v_session.restaurant_id;
  if v_restaurant.deleted_at is not null or v_restaurant.status <> 'active' then
    raise exception 'restaurant_closed';
  end if;
  if not v_restaurant.ordering_enabled then
    raise exception 'ordering_disabled';
  end if;

  v_lines := public._build_order_lines(v_restaurant.id, p_items);

  update public.restaurants set next_order_number = next_order_number + 1
  where id = v_restaurant.id returning next_order_number - 1 into v_number;

  -- Ordering again after settling reopens the tab with a new balance.
  update public.table_sessions set
    order_count = order_count + 1,
    status = case when status = 'paid' then 'open'::public.session_status else status end,
    paid_at = case when status = 'paid' then null else paid_at end
  where id = p_session_id
  returning order_count into v_seq;

  insert into public.orders (restaurant_id, session_id, table_id, guest_id, order_number, session_seq, notes, currency)
  values (v_restaurant.id, p_session_id, v_session.table_id, v_guest.id, v_number, v_seq,
          nullif(btrim(left(p_notes, 500)), ''), v_restaurant.currency)
  returning * into v_order;

  insert into public.order_items (
    order_id, restaurant_id, session_id, position, menu_item_id, variant_id, name, variant_name,
    modifiers, applied_taxes, unit_price_minor, quantity, line_total_minor, notes)
  select v_order.id, v_restaurant.id, p_session_id, l.ordinality::integer,
         (l.value ->> 'menu_item_id')::uuid, nullif(l.value ->> 'variant_id', '')::uuid,
         l.value ->> 'name', l.value ->> 'variant_name', l.value -> 'modifiers', l.value -> 'taxes',
         (l.value ->> 'unit_price_minor')::bigint, (l.value ->> 'quantity')::integer,
         (l.value ->> 'line_total_minor')::bigint, l.value ->> 'notes'
  from jsonb_array_elements(v_lines) with ordinality l;

  perform public.recompute_order_totals(v_order.id);
  select o.* into v_order from public.orders o where o.id = v_order.id;

  select t.label into v_label from public.restaurant_tables t where t.id = v_session.table_id;
  perform public._notify(v_restaurant.id, 'staff', null, p_session_id,
    'order.new', 'New order — Table ' || v_label,
    '#' || v_order.order_number || ' · ' || v_order.item_count || case when v_order.item_count = 1 then ' item' else ' items' end,
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
                       'table_id', v_session.table_id, 'session_id', p_session_id));

  return to_jsonb(v_order);
end;
$$;

-- Bill or waiter call. One open request per type per session.
create or replace function public.request_assistance(
  p_session_id uuid,
  p_type public.request_type,
  p_preferred_method public.payment_method default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.table_sessions;
  v_guest_id uuid;
  v_request public.table_requests;
  v_label text;
  v_amounts record;
  v_currency text;
begin
  select s.* into v_session from public.table_sessions s where s.id = p_session_id for update;
  if not found or not public.is_session_guest(p_session_id) then
    raise exception 'session_not_found';
  end if;
  if v_session.status = 'closed' then
    raise exception 'session_closed';
  end if;
  if p_type = 'bill' and v_session.status = 'paid' then
    raise exception 'session_settled';
  end if;
  if p_preferred_method = 'stripe' then
    raise exception 'invalid_method';
  end if;

  select g.id into v_guest_id from public.session_guests g where g.session_id = p_session_id and g.user_id = auth.uid();

  select r.* into v_request from public.table_requests r
  where r.session_id = p_session_id and r.type = p_type and r.status <> 'resolved';
  if found then
    return to_jsonb(v_request);
  end if;

  insert into public.table_requests (restaurant_id, session_id, table_id, guest_id, type, preferred_method, note)
  values (v_session.restaurant_id, p_session_id, v_session.table_id, v_guest_id, p_type, p_preferred_method,
          nullif(btrim(left(p_note, 200)), ''))
  returning * into v_request;

  select t.label into v_label from public.restaurant_tables t where t.id = v_session.table_id;

  if p_type = 'bill' then
    update public.table_sessions set status = 'bill_requested', bill_requested_at = now()
    where id = p_session_id and status = 'open';
    select * into v_amounts from public._session_amounts(p_session_id);
    select r.currency into v_currency from public.restaurants r where r.id = v_session.restaurant_id;
    perform public._notify(v_session.restaurant_id, 'staff', array['waiter']::public.staff_role[], p_session_id,
      'request.bill', 'Bill requested — Table ' || v_label,
      public.format_money(greatest(v_amounts.total_minor - v_amounts.paid_minor, 0), v_currency) || ' due'
        || coalesce(' · prefers ' || p_preferred_method::text, ''),
      jsonb_build_object('request_id', v_request.id, 'session_id', p_session_id, 'table_id', v_session.table_id));
  else
    perform public._notify(v_session.restaurant_id, 'staff', array['waiter']::public.staff_role[], p_session_id,
      'request.waiter', 'Table ' || v_label || ' is calling for service', v_request.note,
      jsonb_build_object('request_id', v_request.id, 'session_id', p_session_id, 'table_id', v_session.table_id));
  end if;

  return to_jsonb(v_request);
end;
$$;

-- Bill for the whole table (guest of the session or staff).
create or replace function public.session_bill(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.table_sessions;
  v_currency text;
  v_amounts record;
  v_result jsonb;
begin
  select s.* into v_session from public.table_sessions s where s.id = p_session_id;
  if not found or not (public.is_session_guest(p_session_id) or public.is_staff(v_session.restaurant_id)) then
    raise exception 'session_not_found';
  end if;
  select r.currency into v_currency from public.restaurants r where r.id = v_session.restaurant_id;
  select * into v_amounts from public._session_amounts(p_session_id);

  select jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'currency', v_currency,
    'order_count', count(*),
    'subtotal_minor', coalesce(sum(o.subtotal_minor), 0),
    'inclusive_tax_minor', coalesce(sum(o.inclusive_tax_minor), 0),
    'exclusive_tax_minor', coalesce(sum(o.exclusive_tax_minor), 0),
    'total_minor', v_amounts.total_minor,
    'paid_minor', v_amounts.paid_minor,
    'due_minor', greatest(v_amounts.total_minor - v_amounts.paid_minor, 0),
    'taxes', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'rate_bps', x.rate_bps, 'is_inclusive', x.is_inclusive,
                                          'amount_minor', x.amount) order by x.ord)
      from (
        select ot.name, ot.rate_bps, ot.is_inclusive, sum(ot.amount_minor) as amount, min(o2.session_seq) as ord
        from public.order_taxes ot
        join public.orders o2 on o2.id = ot.order_id
        where o2.session_id = p_session_id and o2.status <> 'cancelled'
        group by ot.name, ot.rate_bps, ot.is_inclusive
      ) x
    ), '[]'::jsonb),
    'pending_online_payment', exists (
      select 1 from public.payments p
      where p.session_id = p_session_id and p.status = 'pending' and p.method = 'stripe'
        and p.created_at > now() - interval '35 minutes')
  )
  into v_result
  from public.orders o
  where o.session_id = p_session_id and o.status <> 'cancelled';

  return v_result;
end;
$$;

create or replace function public.submit_review(p_session_id uuid, p_rating integer, p_body text default null, p_guest_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.table_sessions;
  v_review public.reviews;
begin
  select s.* into v_session from public.table_sessions s where s.id = p_session_id;
  if not found or not public.is_session_guest(p_session_id) then
    raise exception 'session_not_found';
  end if;
  if v_session.status not in ('paid', 'closed') then
    raise exception 'review_not_available';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  insert into public.reviews (restaurant_id, session_id, user_id, guest_name, rating, body)
  values (v_session.restaurant_id, p_session_id, auth.uid(), nullif(btrim(left(p_guest_name, 40)), ''),
          p_rating, nullif(btrim(left(p_body, 2000)), ''))
  on conflict (session_id, user_id) do update
    set rating = excluded.rating, body = excluded.body, guest_name = excluded.guest_name
  returning * into v_review;

  return to_jsonb(v_review);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Staff RPCs
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'order_not_found';
  end if;
  perform public._require_staff(v_order.restaurant_id);
  if p_status = 'cancelled' then
    perform public._require_staff(v_order.restaurant_id, array['manager', 'waiter']::public.staff_role[]);
  end if;

  update public.orders set
    status = p_status,
    cancel_reason = case when p_status = 'cancelled' then nullif(btrim(left(p_reason, 200)), '') else cancel_reason end
  where id = p_order_id
  returning * into v_order;

  if p_status = 'cancelled' then
    perform public._settle_session(v_order.session_id);
  end if;
  return to_jsonb(v_order);
end;
$$;

-- Move every order of a table in one status to the next (e.g. deliver all ready orders together).
create or replace function public.advance_session_orders(p_session_id uuid, p_from public.order_status, p_to public.order_status)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_count integer;
begin
  select s.restaurant_id into v_restaurant_id from public.table_sessions s where s.id = p_session_id;
  if v_restaurant_id is null then
    raise exception 'session_not_found';
  end if;
  perform public._require_staff(v_restaurant_id);
  if p_to = 'cancelled' then
    raise exception 'invalid_transition';
  end if;
  update public.orders set status = p_to where session_id = p_session_id and status = p_from;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public._mark_item_sold_out(p_item_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.menu_items;
  v_reporter text;
begin
  update public.menu_items set availability = 'sold_out'
  where id = p_item_id and availability = 'available'
  returning * into v_item;
  if not found then
    return;
  end if;

  insert into public.availability_reports (restaurant_id, menu_item_id, reported_by, note)
  values (v_item.restaurant_id, v_item.id, auth.uid(), nullif(btrim(left(p_note, 200)), ''));

  select s.display_name into v_reporter from public.staff_members s
  where s.restaurant_id = v_item.restaurant_id and s.user_id = auth.uid();

  perform public._notify(v_item.restaurant_id, 'staff', array['manager']::public.staff_role[], null,
    'item.unavailable', v_item.name || ' is unavailable',
    coalesce(nullif(btrim(p_note), '') || ' — ', '') || 'Reported by ' || coalesce(v_reporter, 'staff') || '. Guests can no longer order it.',
    jsonb_build_object('menu_item_id', v_item.id));
end;
$$;

-- Kitchen/waitstaff: "we're out of X". Marks it sold out (never deletes) and alerts managers.
create or replace function public.report_item_unavailable(p_item_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
begin
  select i.restaurant_id into v_restaurant_id from public.menu_items i where i.id = p_item_id;
  if v_restaurant_id is null then
    raise exception 'item_not_found';
  end if;
  perform public._require_staff(v_restaurant_id);
  perform public._mark_item_sold_out(p_item_id, p_note);
end;
$$;

-- Any staff can toggle available <-> sold_out; only managers can hide.
create or replace function public.set_item_availability(p_item_id uuid, p_availability public.item_availability)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.menu_items;
begin
  select i.* into v_item from public.menu_items i where i.id = p_item_id;
  if not found then
    raise exception 'item_not_found';
  end if;
  perform public._require_staff(v_item.restaurant_id,
    case when p_availability = 'hidden' or v_item.availability = 'hidden'
         then array['manager']::public.staff_role[] end);

  if p_availability = 'sold_out' and v_item.availability = 'available' then
    perform public._mark_item_sold_out(p_item_id, null);
  else
    update public.menu_items set availability = p_availability where id = p_item_id;
  end if;

  if p_availability = 'available' then
    update public.availability_reports set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
    where menu_item_id = p_item_id and status = 'open';
  end if;

  select i.* into v_item from public.menu_items i where i.id = p_item_id;
  return to_jsonb(v_item);
end;
$$;

-- Remove a line the kitchen can't make; the guest isn't charged and is told why.
create or replace function public.void_order_item(p_order_item_id uuid, p_reason text default null, p_mark_sold_out boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.order_items;
  v_order public.orders;
  v_session_status public.session_status;
begin
  select oi.* into v_line from public.order_items oi where oi.id = p_order_item_id;
  if not found then
    raise exception 'order_item_not_found';
  end if;
  perform public._require_staff(v_line.restaurant_id);

  select o.* into v_order from public.orders o where o.id = v_line.order_id for update;
  select s.status into v_session_status from public.table_sessions s where s.id = v_order.session_id;
  if v_order.status = 'cancelled' or v_line.is_voided then
    raise exception 'already_removed';
  end if;
  if v_session_status in ('paid', 'closed') then
    raise exception 'session_settled';
  end if;

  update public.order_items set
    is_voided = true, voided_at = now(), voided_by = auth.uid(),
    void_reason = coalesce(nullif(btrim(left(p_reason, 200)), ''), 'Unavailable')
  where id = p_order_item_id;

  perform public.recompute_order_totals(v_order.id);

  perform public._notify(v_order.restaurant_id, 'session', null, v_order.session_id,
    'item.voided', v_line.name || ' is currently unavailable',
    'It was removed from order #' || v_order.order_number || '. You won''t be charged for it.',
    jsonb_build_object('order_id', v_order.id, 'order_item_id', v_line.id));

  if not exists (select 1 from public.order_items oi where oi.order_id = v_order.id and not oi.is_voided) then
    update public.orders set status = 'cancelled', cancel_reason = 'All items unavailable' where id = v_order.id;
  end if;

  if p_mark_sold_out and v_line.menu_item_id is not null then
    perform public._mark_item_sold_out(v_line.menu_item_id, p_reason);
  end if;

  perform public._settle_session(v_order.session_id);

  select o.* into v_order from public.orders o where o.id = v_order.id;
  return to_jsonb(v_order);
end;
$$;

create or replace function public.update_request_status(p_request_id uuid, p_status public.request_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.table_requests;
begin
  select r.* into v_request from public.table_requests r where r.id = p_request_id for update;
  if not found then
    raise exception 'request_not_found';
  end if;
  perform public._require_staff(v_request.restaurant_id);

  update public.table_requests set
    status = p_status,
    acknowledged_at = case when p_status in ('acknowledged', 'resolved') then coalesce(acknowledged_at, now()) end,
    resolved_at = case when p_status = 'resolved' then now() end,
    resolved_by = case when p_status = 'resolved' then auth.uid() end
  where id = p_request_id
  returning * into v_request;

  -- Dismissing a bill request without payment returns the tab to normal.
  if v_request.type = 'bill' and p_status = 'resolved' then
    update public.table_sessions set status = 'open' where id = v_request.session_id and status = 'bill_requested';
  end if;
  return to_jsonb(v_request);
end;
$$;

-- Cash / card terminal / other: only staff confirmation marks money as received.
create or replace function public.record_manual_payment(
  p_session_id uuid,
  p_method public.payment_method,
  p_amount_minor bigint default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.table_sessions;
  v_amounts record;
  v_due bigint;
  v_amount bigint;
  v_currency text;
  v_payment public.payments;
begin
  select s.* into v_session from public.table_sessions s where s.id = p_session_id for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  perform public._require_staff(v_session.restaurant_id, array['manager', 'waiter']::public.staff_role[]);
  if p_method = 'stripe' then
    raise exception 'invalid_method';
  end if;
  if v_session.status not in ('open', 'bill_requested') then
    raise exception 'session_settled';
  end if;

  select * into v_amounts from public._session_amounts(p_session_id);
  v_due := greatest(v_amounts.total_minor - v_amounts.paid_minor, 0);
  v_amount := coalesce(p_amount_minor, v_due);
  if v_due = 0 then
    raise exception 'nothing_due';
  end if;
  if v_amount <= 0 or v_amount > v_due then
    raise exception 'invalid_amount';
  end if;

  select r.currency into v_currency from public.restaurants r where r.id = v_session.restaurant_id;
  insert into public.payments (restaurant_id, session_id, method, status, amount_minor, currency,
                               initiated_by, confirmed_by, confirmed_at, note)
  values (v_session.restaurant_id, p_session_id, p_method, 'succeeded', v_amount, v_currency,
          auth.uid(), auth.uid(), now(), nullif(btrim(left(p_note, 200)), ''))
  returning * into v_payment;

  perform public._settle_session(p_session_id);
  return to_jsonb(v_payment);
end;
$$;

-- "Clear table": closes the tab. Unpaid balances need a manager's explicit override.
create or replace function public.close_session(p_session_id uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.table_sessions;
  v_amounts record;
begin
  select s.* into v_session from public.table_sessions s where s.id = p_session_id for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  perform public._require_staff(v_session.restaurant_id);
  if v_session.status = 'closed' then
    return;
  end if;
  select * into v_amounts from public._session_amounts(p_session_id);
  if v_amounts.total_minor > v_amounts.paid_minor then
    if not p_force then
      raise exception 'balance_due';
    end if;
    perform public._require_staff(v_session.restaurant_id, array['manager']::public.staff_role[]);
  end if;

  update public.table_sessions set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = p_session_id;
  update public.table_requests set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  where session_id = p_session_id and status <> 'resolved';
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Manager RPCs
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_restaurant(
  p_name text,
  p_slug text,
  p_currency text default 'USD',
  p_timezone text default 'UTC',
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant public.restaurants;
  v_profile public.profiles;
begin
  if auth.uid() is null or public.is_anon() then
    raise exception 'account_required' using errcode = '42501';
  end if;
  if exists (select 1 from public.restaurants r where r.slug = lower(p_slug)) then
    raise exception 'slug_taken';
  end if;

  insert into public.restaurants (name, slug, currency, timezone, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), upper(p_currency), p_timezone, auth.uid())
  returning * into v_restaurant;

  select p.* into v_profile from public.profiles p where p.id = auth.uid();
  insert into public.staff_members (restaurant_id, user_id, role, display_name, email, is_owner)
  values (v_restaurant.id, auth.uid(), 'manager',
          coalesce(nullif(btrim(p_display_name), ''), v_profile.full_name, split_part(v_profile.email, '@', 1), 'Owner'),
          v_profile.email, true);

  return to_jsonb(v_restaurant);
end;
$$;

create or replace function public.set_restaurant_status(p_restaurant_id uuid, p_status public.restaurant_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant public.restaurants;
begin
  perform public._require_staff(p_restaurant_id, array['manager']::public.staff_role[]);
  update public.restaurants set
    status = p_status,
    closed_at = case when p_status = 'closed' then now() end
  where id = p_restaurant_id and deleted_at is null
  returning * into v_restaurant;
  if not found then
    raise exception 'restaurant_not_found';
  end if;
  return to_jsonb(v_restaurant);
end;
$$;

-- Soft delete: hidden publicly, no new orders, all financial records preserved. Owner only.
create or replace function public.delete_restaurant(p_restaurant_id uuid, p_confirm_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant public.restaurants;
begin
  select r.* into v_restaurant from public.restaurants r where r.id = p_restaurant_id for update;
  if not found or not exists (
    select 1 from public.staff_members s
    where s.restaurant_id = p_restaurant_id and s.user_id = auth.uid() and s.is_owner and s.is_active
  ) or public.is_anon() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_confirm_slug is distinct from v_restaurant.slug then
    raise exception 'confirmation_mismatch';
  end if;
  update public.restaurants set deleted_at = now(), status = 'closed', closed_at = coalesce(closed_at, now()),
                                ordering_enabled = false
  where id = p_restaurant_id;
end;
$$;

create or replace function public.moderate_review(p_review_id uuid, p_is_hidden boolean, p_is_featured boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.reviews;
begin
  select r.* into v_review from public.reviews r where r.id = p_review_id;
  if not found then
    raise exception 'review_not_found';
  end if;
  perform public._require_staff(v_review.restaurant_id, array['manager']::public.staff_role[]);
  update public.reviews set
    is_hidden = coalesce(p_is_hidden, is_hidden),
    -- a hidden review can't be featured
    is_featured = coalesce(p_is_featured, is_featured) and not coalesce(p_is_hidden, is_hidden)
  where id = p_review_id
  returning * into v_review;
  return to_jsonb(v_review);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Read models for staff & managers
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_table_board(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public._require_staff(p_restaurant_id);

  select coalesce(jsonb_agg(b order by b.sort_order, b.label), '[]'::jsonb) into v_result
  from (
    select
      t.id as table_id, t.label, t.capacity, t.sort_order, t.is_active,
      s.id as session_id, s.status as session_status, s.party_size, s.guest_count, s.opened_at,
      coalesce(oc.pending, 0) as pending, coalesce(oc.in_progress, 0) as in_progress,
      coalesce(oc.ready, 0) as ready, coalesce(oc.delivered, 0) as delivered,
      coalesce(oc.total, 0) as total_minor,
      coalesce(pc.paid, 0) as paid_minor,
      greatest(coalesce(oc.total, 0) - coalesce(pc.paid, 0), 0) as due_minor,
      coalesce(rq.bill, false) as bill_requested,
      coalesce(rq.waiter, false) as waiter_called,
      rq.preferred_method,
      case
        when s.id is null then 'idle'
        when coalesce(rq.bill, false) or s.status = 'bill_requested' then 'bill_requested'
        when coalesce(oc.ready, 0) > 0 then 'ready'
        when coalesce(oc.pending, 0) > 0 then 'new_order'
        when coalesce(oc.in_progress, 0) > 0 then 'preparing'
        when s.status = 'paid' then 'paid'
        else 'active'
      end as state
    from public.restaurant_tables t
    left join public.table_sessions s
      on s.table_id = t.id and s.status in ('open', 'bill_requested', 'paid')
    left join lateral (
      select count(*) filter (where o.status = 'pending') as pending,
             count(*) filter (where o.status in ('accepted', 'preparing')) as in_progress,
             count(*) filter (where o.status = 'ready') as ready,
             count(*) filter (where o.status = 'delivered') as delivered,
             sum(o.total_minor) filter (where o.status <> 'cancelled') as total
      from public.orders o where o.session_id = s.id
    ) oc on true
    left join lateral (
      select sum(p.amount_minor) as paid from public.payments p where p.session_id = s.id and p.status = 'succeeded'
    ) pc on true
    left join lateral (
      select bool_or(r.type = 'bill') as bill, bool_or(r.type = 'waiter') as waiter,
             max(r.preferred_method::text) filter (where r.type = 'bill') as preferred_method
      from public.table_requests r where r.session_id = s.id and r.status <> 'resolved'
    ) rq on true
    where t.restaurant_id = p_restaurant_id and t.archived_at is null
  ) b;

  return v_result;
end;
$$;

create or replace function public.get_dashboard(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_start timestamptz;
  v_result jsonb;
begin
  perform public._require_staff(p_restaurant_id, array['manager']::public.staff_role[]);
  select r.timezone into v_tz from public.restaurants r where r.id = p_restaurant_id;
  v_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;

  with today_orders as (
    select o.* from public.orders o
    where o.restaurant_id = p_restaurant_id and o.placed_at >= v_start and o.status <> 'cancelled'
  ),
  active_sessions as (
    select s.id, a.total_minor, a.paid_minor
    from public.table_sessions s, lateral public._session_amounts(s.id) a
    where s.restaurant_id = p_restaurant_id and s.status in ('open', 'bill_requested')
  )
  select jsonb_build_object(
    'currency', (select r.currency from public.restaurants r where r.id = p_restaurant_id),
    'revenue_today_minor', (select coalesce(sum(p.amount_minor), 0) from public.payments p
                            where p.restaurant_id = p_restaurant_id and p.status = 'succeeded' and p.confirmed_at >= v_start),
    'sales_today_minor', (select coalesce(sum(total_minor), 0) from today_orders),
    'orders_today', (select count(*) from today_orders),
    'avg_order_minor', (select coalesce(public.div_round(sum(total_minor)::bigint, count(*)), 0) from today_orders having count(*) > 0),
    'paid_orders_today', (select count(*) from today_orders o join public.table_sessions s on s.id = o.session_id
                          where s.status in ('paid', 'closed')),
    'pending_payments_minor', (select coalesce(sum(greatest(total_minor - paid_minor, 0)), 0) from active_sessions),
    'tabs_with_balance', (select count(*) from active_sessions where total_minor > paid_minor),
    'active_tables', (select count(*) from public.table_sessions s
                      where s.restaurant_id = p_restaurant_id and s.status in ('open', 'bill_requested', 'paid')),
    'total_tables', (select count(*) from public.restaurant_tables t where t.restaurant_id = p_restaurant_id and t.archived_at is null),
    'guests_seated', (select coalesce(sum(s.party_size), 0) from public.table_sessions s
                      where s.restaurant_id = p_restaurant_id and s.status in ('open', 'bill_requested')),
    'orders_pending', (select count(*) from public.orders o where o.restaurant_id = p_restaurant_id and o.status = 'pending'),
    'orders_accepted', (select count(*) from public.orders o where o.restaurant_id = p_restaurant_id and o.status = 'accepted'),
    'orders_preparing', (select count(*) from public.orders o where o.restaurant_id = p_restaurant_id and o.status = 'preparing'),
    'orders_ready', (select count(*) from public.orders o where o.restaurant_id = p_restaurant_id and o.status = 'ready'),
    'orders_completed_today', (select count(*) from today_orders where status = 'delivered'),
    'open_bill_requests', (select count(*) from public.table_requests r
                           where r.restaurant_id = p_restaurant_id and r.type = 'bill' and r.status <> 'resolved'),
    'open_availability_reports', (select count(*) from public.availability_reports a
                                  where a.restaurant_id = p_restaurant_id and a.status = 'open'),
    'rating_avg', (select case when r.rating_count > 0 then round(r.rating_sum::numeric / r.rating_count, 2) end
                   from public.restaurants r where r.id = p_restaurant_id),
    'rating_count', (select r.rating_count from public.restaurants r where r.id = p_restaurant_id)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_analytics(p_restaurant_id uuid, p_days integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_days integer := least(greatest(coalesce(p_days, 14), 1), 365);
  v_start timestamptz;
  v_result jsonb;
begin
  perform public._require_staff(p_restaurant_id, array['manager']::public.staff_role[]);
  select r.timezone into v_tz from public.restaurants r where r.id = p_restaurant_id;
  v_start := (date_trunc('day', now() at time zone v_tz) - make_interval(days => v_days - 1)) at time zone v_tz;

  with o as (
    select x.* from public.orders x
    where x.restaurant_id = p_restaurant_id and x.placed_at >= v_start and x.status <> 'cancelled'
  ),
  days as (
    select generate_series(
      (date_trunc('day', now() at time zone v_tz) - make_interval(days => v_days - 1))::date,
      (now() at time zone v_tz)::date, interval '1 day')::date as day
  )
  select jsonb_build_object(
    'currency', (select r.currency from public.restaurants r where r.id = p_restaurant_id),
    'days', v_days,
    'totals', jsonb_build_object(
      'orders', (select count(*) from o),
      'sales_minor', (select coalesce(sum(total_minor), 0) from o),
      'avg_order_minor', (select coalesce(public.div_round(sum(total_minor)::bigint, count(*)), 0) from o having count(*) > 0),
      'revenue_minor', (select coalesce(sum(p.amount_minor), 0) from public.payments p
                        where p.restaurant_id = p_restaurant_id and p.status = 'succeeded' and p.confirmed_at >= v_start)
    ),
    'by_day', (
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'orders', coalesce(od.orders, 0),
        'sales_minor', coalesce(od.sales, 0),
        'revenue_minor', coalesce(pd.revenue, 0),
        'avg_order_minor', case when coalesce(od.orders, 0) > 0 then public.div_round(od.sales::bigint, od.orders) else 0 end
      ) order by d.day)
      from days d
      left join (
        select (placed_at at time zone v_tz)::date as day, count(*) as orders, sum(total_minor) as sales
        from o group by 1
      ) od on od.day = d.day
      left join (
        select (p.confirmed_at at time zone v_tz)::date as day, sum(p.amount_minor) as revenue
        from public.payments p
        where p.restaurant_id = p_restaurant_id and p.status = 'succeeded' and p.confirmed_at >= v_start
        group by 1
      ) pd on pd.day = d.day
    ),
    'by_hour', (
      select jsonb_agg(jsonb_build_object('hour', h.hour, 'orders', coalesce(oh.orders, 0)) order by h.hour)
      from generate_series(0, 23) as h(hour)
      left join (
        select extract(hour from placed_at at time zone v_tz)::integer as hour, count(*) as orders
        from o group by 1
      ) oh on oh.hour = h.hour
    ),
    'popular_items', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'quantity', qty, 'sales_minor', sales) order by qty desc, name)
      from (
        select oi.name, sum(oi.quantity) as qty, sum(oi.line_total_minor) as sales
        from public.order_items oi join o on o.id = oi.order_id
        where not oi.is_voided
        group by oi.name
        order by qty desc, oi.name
        limit 8
      ) pi
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Stripe (service role only — called by the Node API after verifying the guest's JWT)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.stripe_prepare_payment(p_session_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.table_sessions;
  v_restaurant public.restaurants;
  v_amounts record;
  v_due bigint;
  v_label text;
  v_payment public.payments;
begin
  select s.* into v_session from public.table_sessions s where s.id = p_session_id for update;
  if not found or not exists (
    select 1 from public.session_guests g where g.session_id = p_session_id and g.user_id = p_user_id
  ) then
    raise exception 'session_not_found';
  end if;
  if v_session.status not in ('open', 'bill_requested') then
    raise exception 'session_settled';
  end if;

  select r.* into v_restaurant from public.restaurants r where r.id = v_session.restaurant_id;
  select * into v_amounts from public._session_amounts(p_session_id);
  v_due := greatest(v_amounts.total_minor - v_amounts.paid_minor, 0);
  if v_due = 0 then
    raise exception 'nothing_due';
  end if;

  -- One online checkout at a time per table, so two phones can't both pay the full tab.
  if exists (
    select 1 from public.payments p
    where p.session_id = p_session_id and p.method = 'stripe' and p.status = 'pending'
      and p.created_at > now() - interval '35 minutes' and p.initiated_by <> p_user_id
  ) then
    raise exception 'payment_in_progress';
  end if;
  update public.payments set status = 'cancelled', failure_reason = 'superseded'
  where session_id = p_session_id and method = 'stripe' and status = 'pending' and initiated_by = p_user_id;

  insert into public.payments (restaurant_id, session_id, method, status, amount_minor, currency, initiated_by)
  values (v_restaurant.id, p_session_id, 'stripe', 'pending', v_due, v_restaurant.currency, p_user_id)
  returning * into v_payment;

  select t.label into v_label from public.restaurant_tables t where t.id = v_session.table_id;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'amount_minor', v_due,
    'currency', v_restaurant.currency,
    'restaurant_name', v_restaurant.name,
    'restaurant_id', v_restaurant.id,
    'table_label', v_label
  );
end;
$$;

create or replace function public.stripe_attach_checkout(p_payment_id uuid, p_checkout_session_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments set stripe_checkout_session_id = p_checkout_session_id
  where id = p_payment_id and method = 'stripe';
$$;

-- Idempotent: replays of the same webhook are no-ops.
create or replace function public.stripe_complete_payment(
  p_payment_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount_minor bigint,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_settled boolean;
begin
  select p.* into v_payment from public.payments p where p.id = p_payment_id for update;
  if not found or v_payment.method <> 'stripe' then
    raise exception 'payment_not_found';
  end if;
  if v_payment.status = 'succeeded' then
    return jsonb_build_object('payment_id', v_payment.id, 'already_processed', true);
  end if;
  if v_payment.stripe_checkout_session_id is not null and v_payment.stripe_checkout_session_id <> p_checkout_session_id then
    raise exception 'checkout_mismatch';
  end if;
  if p_amount_minor <> v_payment.amount_minor or upper(p_currency) <> v_payment.currency then
    raise exception 'amount_mismatch';
  end if;

  -- A late success for a checkout we had cancelled is still real money: record it.
  update public.payments set
    status = 'succeeded',
    stripe_checkout_session_id = p_checkout_session_id,
    stripe_payment_intent_id = p_payment_intent_id,
    confirmed_at = now(),
    failure_reason = null
  where id = p_payment_id;

  v_settled := public._settle_session(v_payment.session_id);
  return jsonb_build_object('payment_id', v_payment.id, 'already_processed', false, 'session_paid', v_settled);
end;
$$;

create or replace function public.stripe_fail_payment(p_payment_id uuid, p_status public.payment_status, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments set status = p_status, failure_reason = left(p_reason, 200)
  where id = p_payment_id and method = 'stripe' and status = 'pending' and p_status in ('failed', 'cancelled');
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Function privileges: internal helpers are not callable by clients.
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public._require_staff(uuid, public.staff_role[]) from public, anon, authenticated;
revoke execute on function public._item_taxes(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public._build_order_lines(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.recompute_order_totals(uuid) from public, anon, authenticated;
revoke execute on function public._notify(uuid, public.notification_audience, public.staff_role[], uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public._session_amounts(uuid) from public, anon, authenticated;
revoke execute on function public._settle_session(uuid) from public, anon, authenticated;
revoke execute on function public._mark_item_sold_out(uuid, text) from public, anon, authenticated;
revoke execute on function public._handle_new_user() from public, anon, authenticated;
revoke execute on function public._restaurant_defaults() from public, anon, authenticated;
revoke execute on function public._restaurant_currency_guard() from public, anon, authenticated;
revoke execute on function public._staff_guard() from public, anon, authenticated;
revoke execute on function public._order_status_effects() from public, anon, authenticated;
revoke execute on function public._review_aggregates() from public, anon, authenticated;
revoke execute on function public.stripe_prepare_payment(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.stripe_attach_checkout(uuid, text) from public, anon, authenticated;
revoke execute on function public.stripe_complete_payment(uuid, text, text, bigint, text) from public, anon, authenticated;
revoke execute on function public.stripe_fail_payment(uuid, public.payment_status, text) from public, anon, authenticated;

grant execute on function public.stripe_prepare_payment(uuid, uuid) to service_role;
grant execute on function public.stripe_attach_checkout(uuid, text) to service_role;
grant execute on function public.stripe_complete_payment(uuid, text, text, bigint, text) to service_role;
grant execute on function public.stripe_fail_payment(uuid, public.payment_status, text) to service_role;
grant execute on function public._session_amounts(uuid) to service_role;

-- Guest/public entry points.
revoke execute on function public.get_table_entry(uuid) from public;
grant execute on function public.get_table_entry(uuid) to anon, authenticated;
-- Everything else requires a JWT (anonymous guests included).
revoke execute on function public.join_table(uuid, integer, text) from public, anon;
revoke execute on function public.quote_order(uuid, jsonb) from public, anon;
revoke execute on function public.place_order(uuid, jsonb, text) from public, anon;
revoke execute on function public.request_assistance(uuid, public.request_type, public.payment_method, text) from public, anon;
revoke execute on function public.session_bill(uuid) from public, anon;
revoke execute on function public.submit_review(uuid, integer, text, text) from public, anon;
revoke execute on function public.set_order_status(uuid, public.order_status, text) from public, anon;
revoke execute on function public.advance_session_orders(uuid, public.order_status, public.order_status) from public, anon;
revoke execute on function public.report_item_unavailable(uuid, text) from public, anon;
revoke execute on function public.set_item_availability(uuid, public.item_availability) from public, anon;
revoke execute on function public.void_order_item(uuid, text, boolean) from public, anon;
revoke execute on function public.update_request_status(uuid, public.request_status) from public, anon;
revoke execute on function public.record_manual_payment(uuid, public.payment_method, bigint, text) from public, anon;
revoke execute on function public.close_session(uuid, boolean) from public, anon;
revoke execute on function public.create_restaurant(text, text, text, text, text) from public, anon;
revoke execute on function public.set_restaurant_status(uuid, public.restaurant_status) from public, anon;
revoke execute on function public.delete_restaurant(uuid, text) from public, anon;
revoke execute on function public.moderate_review(uuid, boolean, boolean) from public, anon;
revoke execute on function public.get_table_board(uuid) from public, anon;
revoke execute on function public.get_dashboard(uuid) from public, anon;
revoke execute on function public.get_analytics(uuid, integer) from public, anon;
