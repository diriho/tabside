-- TABSide core schema
-- Money is always stored as integer minor units (bigint) next to an explicit ISO 4217 currency.
-- Tenant integrity: child rows carry restaurant_id and use composite FKs (id, restaurant_id)
-- so a row can never point at another restaurant's parent.

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────
create type public.staff_role as enum ('manager', 'kitchen', 'waiter');
create type public.restaurant_status as enum ('active', 'closed');
create type public.menu_mode as enum ('html', 'pdf');
create type public.item_availability as enum ('available', 'sold_out', 'hidden');
create type public.session_status as enum ('open', 'bill_requested', 'paid', 'closed');
create type public.order_status as enum ('pending', 'accepted', 'preparing', 'ready', 'delivered', 'cancelled');
create type public.request_type as enum ('bill', 'waiter');
create type public.request_status as enum ('open', 'acknowledged', 'resolved');
create type public.payment_method as enum ('stripe', 'cash', 'card', 'other');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'cancelled');
create type public.tax_scope as enum ('all', 'categories', 'items');
create type public.review_display_mode as enum ('all_visible', 'featured_only');
create type public.notification_audience as enum ('staff', 'session');
create type public.report_status as enum ('open', 'resolved');

-- ─────────────────────────────────────────────────────────────────────────────
-- Utilities
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.is_valid_timezone(tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Reference data
-- ─────────────────────────────────────────────────────────────────────────────
create table public.currencies (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  exponent smallint not null check (exponent between 0 and 3)
);

insert into public.currencies (code, name, exponent) values
  ('USD', 'US Dollar', 2),
  ('EUR', 'Euro', 2),
  ('GBP', 'British Pound', 2),
  ('CAD', 'Canadian Dollar', 2),
  ('AUD', 'Australian Dollar', 2),
  ('CHF', 'Swiss Franc', 2),
  ('JPY', 'Japanese Yen', 0),
  ('INR', 'Indian Rupee', 2),
  ('AED', 'UAE Dirham', 2),
  ('MXN', 'Mexican Peso', 2),
  ('BRL', 'Brazilian Real', 2),
  ('ZAR', 'South African Rand', 2),
  ('NGN', 'Nigerian Naira', 2),
  ('GHS', 'Ghanaian Cedi', 2),
  ('KES', 'Kenyan Shilling', 2),
  ('TZS', 'Tanzanian Shilling', 2),
  ('UGX', 'Ugandan Shilling', 0),
  ('RWF', 'Rwandan Franc', 0),
  ('BIF', 'Burundian Franc', 0),
  ('ETB', 'Ethiopian Birr', 2),
  ('XOF', 'West African CFA Franc', 0),
  ('XAF', 'Central African CFA Franc', 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- Identity
-- ─────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Restaurants
-- ─────────────────────────────────────────────────────────────────────────────
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 60),
  name text not null check (length(btrim(name)) between 1 and 120),
  tagline text check (length(tagline) <= 160),
  description text check (length(description) <= 4000),
  logo_url text,
  hero_image_url text,
  gallery_urls text[] not null default '{}',
  address text,
  phone text,
  email text,
  website_url text,
  instagram_handle text,
  -- {"mon":[{"open":"11:00","close":"22:00"}], ..., "sun":[]}
  opening_hours jsonb not null default '{}'::jsonb check (jsonb_typeof(opening_hours) = 'object'),
  timezone text not null default 'UTC' check (public.is_valid_timezone(timezone)),
  currency char(3) not null default 'USD' references public.currencies (code),
  menu_mode public.menu_mode not null default 'html',
  menu_pdf_url text,
  ordering_enabled boolean not null default true,
  status public.restaurant_status not null default 'active',
  closed_at timestamptz,
  deleted_at timestamptz,
  next_order_number integer not null default 1001,
  rating_count integer not null default 0 check (rating_count >= 0),
  rating_sum integer not null default 0 check (rating_sum >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.staff_role not null,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  email text,
  is_owner boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);
create index staff_members_user_idx on public.staff_members (user_id) where is_active;

create table public.restaurant_review_settings (
  restaurant_id uuid primary key references public.restaurants (id) on delete cascade,
  display_mode public.review_display_mode not null default 'all_visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables (physical) and sessions (running tabs)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 40),
  capacity integer not null default 4 check (capacity between 1 and 50),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id)
);
create unique index restaurant_tables_label_uniq
  on public.restaurant_tables (restaurant_id, lower(label)) where archived_at is null;

create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_id uuid not null,
  status public.session_status not null default 'open',
  party_size integer not null default 1 check (party_size between 1 and 50),
  guest_count integer not null default 0 check (guest_count >= 0),
  order_count integer not null default 0 check (order_count >= 0),
  opened_at timestamptz not null default now(),
  bill_requested_at timestamptz,
  paid_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  foreign key (table_id, restaurant_id) references public.restaurant_tables (id, restaurant_id)
);
-- THE core invariant: a table has at most one active tab.
create unique index table_sessions_one_active_per_table
  on public.table_sessions (table_id) where status in ('open', 'bill_requested', 'paid');
create index table_sessions_restaurant_status_idx on public.table_sessions (restaurant_id, status);
create index table_sessions_restaurant_opened_idx on public.table_sessions (restaurant_id, opened_at desc);

create table public.session_guests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  restaurant_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  guest_number integer not null check (guest_number >= 1),
  display_name text check (length(display_name) <= 40),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id),
  unique (session_id, guest_number),
  unique (id, session_id),
  foreign key (session_id, restaurant_id) references public.table_sessions (id, restaurant_id) on delete cascade
);
create index session_guests_user_idx on public.session_guests (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Menu
-- ─────────────────────────────────────────────────────────────────────────────
create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  description text check (length(description) <= 500),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id)
);
create index menu_categories_restaurant_idx on public.menu_categories (restaurant_id, sort_order);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id uuid,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text check (length(description) <= 1000),
  image_url text,
  price_minor bigint not null check (price_minor >= 0),
  availability public.item_availability not null default 'available',
  tags text[] not null default '{}',
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  foreign key (category_id, restaurant_id)
    references public.menu_categories (id, restaurant_id) on delete set null (category_id)
);
create index menu_items_restaurant_idx on public.menu_items (restaurant_id, category_id, sort_order);

create table public.menu_item_variants (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  item_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  price_minor bigint not null check (price_minor >= 0),
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, restaurant_id) references public.menu_items (id, restaurant_id) on delete cascade
);
create index menu_item_variants_item_idx on public.menu_item_variants (item_id, sort_order);

create table public.menu_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  item_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer not null default 1 check (max_select >= 1),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_select >= min_select),
  unique (id, restaurant_id),
  foreign key (item_id, restaurant_id) references public.menu_items (id, restaurant_id) on delete cascade
);
create index menu_modifier_groups_item_idx on public.menu_modifier_groups (item_id, sort_order);

create table public.menu_modifiers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  group_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  price_delta_minor bigint not null default 0 check (price_delta_minor >= 0),
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_id, restaurant_id) references public.menu_modifier_groups (id, restaurant_id) on delete cascade
);
create index menu_modifiers_group_idx on public.menu_modifiers (group_id, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- Taxes
-- ─────────────────────────────────────────────────────────────────────────────
create table public.taxes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  -- basis points: 16% = 1600, 7.25% = 725
  rate_bps integer not null check (rate_bps between 0 and 10000),
  is_inclusive boolean not null default false,
  scope public.tax_scope not null default 'all',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id)
);
create index taxes_restaurant_idx on public.taxes (restaurant_id) where is_active;

create table public.tax_categories (
  tax_id uuid not null,
  category_id uuid not null,
  restaurant_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tax_id, category_id),
  foreign key (tax_id, restaurant_id) references public.taxes (id, restaurant_id) on delete cascade,
  foreign key (category_id, restaurant_id) references public.menu_categories (id, restaurant_id) on delete cascade
);

create table public.tax_items (
  tax_id uuid not null,
  item_id uuid not null,
  restaurant_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tax_id, item_id),
  foreign key (tax_id, restaurant_id) references public.taxes (id, restaurant_id) on delete cascade,
  foreign key (item_id, restaurant_id) references public.menu_items (id, restaurant_id) on delete cascade
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Orders
-- ─────────────────────────────────────────────────────────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  session_id uuid not null,
  table_id uuid not null,
  guest_id uuid,
  order_number integer not null,
  session_seq integer not null check (session_seq >= 1),
  status public.order_status not null default 'pending',
  notes text check (length(notes) <= 500),
  currency char(3) not null references public.currencies (code),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  inclusive_tax_minor bigint not null default 0 check (inclusive_tax_minor >= 0),
  exclusive_tax_minor bigint not null default 0 check (exclusive_tax_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  item_count integer not null default 0 check (item_count >= 0),
  placed_at timestamptz not null default now(),
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, order_number),
  unique (session_id, session_seq),
  unique (id, restaurant_id),
  foreign key (session_id, restaurant_id) references public.table_sessions (id, restaurant_id),
  foreign key (table_id, restaurant_id) references public.restaurant_tables (id, restaurant_id),
  foreign key (guest_id, session_id) references public.session_guests (id, session_id)
);
create index orders_restaurant_status_idx on public.orders (restaurant_id, status);
create index orders_restaurant_placed_idx on public.orders (restaurant_id, placed_at desc);
create index orders_session_idx on public.orders (session_id, session_seq);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  restaurant_id uuid not null,
  session_id uuid not null,
  position integer not null default 0,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  variant_id uuid references public.menu_item_variants (id) on delete set null,
  -- snapshots: what the guest saw and paid for, immune to later menu edits
  name text not null,
  variant_name text,
  modifiers jsonb not null default '[]'::jsonb check (jsonb_typeof(modifiers) = 'array'),
  applied_taxes jsonb not null default '[]'::jsonb check (jsonb_typeof(applied_taxes) = 'array'),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  quantity integer not null check (quantity between 1 and 99),
  line_total_minor bigint not null check (line_total_minor >= 0),
  notes text check (length(notes) <= 200),
  is_voided boolean not null default false,
  void_reason text,
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (order_id, restaurant_id) references public.orders (id, restaurant_id) on delete cascade
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_session_idx on public.order_items (session_id);
create index order_items_menu_item_idx on public.order_items (restaurant_id, menu_item_id);

create table public.order_taxes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  restaurant_id uuid not null,
  tax_id uuid references public.taxes (id) on delete set null,
  name text not null,
  rate_bps integer not null,
  is_inclusive boolean not null,
  amount_minor bigint not null check (amount_minor >= 0),
  created_at timestamptz not null default now(),
  foreign key (order_id, restaurant_id) references public.orders (id, restaurant_id) on delete cascade
);
create index order_taxes_order_idx on public.order_taxes (order_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  restaurant_id uuid not null,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (order_id, restaurant_id) references public.orders (id, restaurant_id) on delete cascade
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Requests, payments, reviews
-- ─────────────────────────────────────────────────────────────────────────────
create table public.table_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  session_id uuid not null,
  table_id uuid not null,
  guest_id uuid,
  type public.request_type not null,
  status public.request_status not null default 'open',
  preferred_method public.payment_method,
  note text check (length(note) <= 200),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, restaurant_id) references public.table_sessions (id, restaurant_id) on delete cascade,
  foreign key (table_id, restaurant_id) references public.restaurant_tables (id, restaurant_id)
);
create unique index table_requests_one_open_per_type
  on public.table_requests (session_id, type) where status <> 'resolved';
create index table_requests_restaurant_status_idx on public.table_requests (restaurant_id, status);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  session_id uuid not null,
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null references public.currencies (code),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  initiated_by uuid references auth.users (id) on delete set null,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  failure_reason text,
  note text check (length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, restaurant_id) references public.table_sessions (id, restaurant_id)
);
create index payments_restaurant_status_idx on public.payments (restaurant_id, status, confirmed_at desc);
create index payments_session_idx on public.payments (session_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  session_id uuid,
  user_id uuid references auth.users (id) on delete set null,
  guest_name text check (length(guest_name) <= 40),
  rating smallint not null check (rating between 1 and 5),
  body text check (length(body) <= 2000),
  is_hidden boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id),
  foreign key (session_id, restaurant_id) references public.table_sessions (id, restaurant_id) on delete set null (session_id)
);
create index reviews_restaurant_idx on public.reviews (restaurant_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Operations: availability reports, notifications
-- ─────────────────────────────────────────────────────────────────────────────
create table public.availability_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  menu_item_id uuid not null,
  reported_by uuid references auth.users (id) on delete set null,
  note text check (length(note) <= 200),
  status public.report_status not null default 'open',
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (menu_item_id, restaurant_id) references public.menu_items (id, restaurant_id) on delete cascade
);
create index availability_reports_restaurant_idx on public.availability_reports (restaurant_id, status);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  audience public.notification_audience not null,
  -- staff audience: null = every staff member; otherwise only these roles (managers always see all)
  recipient_roles public.staff_role[],
  session_id uuid references public.table_sessions (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (audience <> 'session' or session_id is not null)
);
create index notifications_restaurant_idx on public.notifications (restaurant_id, created_at desc);
create index notifications_session_idx on public.notifications (session_id, created_at desc) where session_id is not null;

create table public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at triggers
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'restaurants', 'staff_members', 'restaurant_review_settings', 'restaurant_tables',
    'table_sessions', 'session_guests', 'menu_categories', 'menu_items', 'menu_item_variants',
    'menu_modifier_groups', 'menu_modifiers', 'taxes', 'orders', 'order_items', 'table_requests',
    'payments', 'reviews', 'availability_reports'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;
