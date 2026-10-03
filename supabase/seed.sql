-- TABSide demo seed. Loaded by `supabase db reset`.
-- Demo logins (password for all: tabside-demo)
--   manager@theglobe.test  — The Globe owner/manager
--   kitchen@theglobe.test  — The Globe kitchen
--   waiter@theglobe.test   — The Globe waitstaff
--   manager@cafeubuntu.test — Café Ubuntu owner/manager (BIF, tax-inclusive)

select setseed(0.42);

-- ─────────────────────────────────────────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────────────────────────────────────────
create function pg_temp.seed_user(p_id uuid, p_email text, p_name text)
returns void
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('tabside-demo', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', p_name),
    now(), now(), '', '', '', '', '', '', '', '', false, false
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text,
          jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());
end;
$$;

select pg_temp.seed_user('00000000-0000-4000-8000-0000000000a1', 'manager@theglobe.test', 'Amara Okafor');
select pg_temp.seed_user('00000000-0000-4000-8000-0000000000a2', 'kitchen@theglobe.test', 'Luca Romano');
select pg_temp.seed_user('00000000-0000-4000-8000-0000000000a3', 'waiter@theglobe.test', 'Sofia Mendes');
select pg_temp.seed_user('00000000-0000-4000-8000-0000000000b1', 'manager@cafeubuntu.test', 'Eric Ndayishimiye');

-- ─────────────────────────────────────────────────────────────────────────────
-- The Globe (USD, Chicago)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.restaurants (
  id, slug, name, tagline, description, logo_url, hero_image_url, gallery_urls, address, phone, email,
  website_url, instagram_handle, opening_hours, timezone, currency, created_by
) values (
  '11111111-1111-4111-8111-111111111111', 'the-globe', 'The Globe',
  'Neighbourhood kitchen & bar since 2009',
  'A warm corner spot in the West Loop serving honest, seasonal comfort food — smash burgers, wood-fired pizza, hand-rolled pasta and a short list of natural wines. Order from your table whenever you like; we''ll bring it over.',
  null,
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80&auto=format&fit=crop',
  array[
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80&auto=format&fit=crop'
  ],
  '914 W Randolph St, Chicago, IL 60607', '+1 (312) 555-0142', 'hello@theglobe.test',
  'https://theglobe.test', 'theglobechicago',
  '{"mon":[{"open":"11:30","close":"22:00"}],"tue":[{"open":"11:30","close":"22:00"}],"wed":[{"open":"11:30","close":"22:00"}],"thu":[{"open":"11:30","close":"23:00"}],"fri":[{"open":"11:30","close":"23:30"}],"sat":[{"open":"10:00","close":"23:30"}],"sun":[{"open":"10:00","close":"21:00"}]}',
  'America/Chicago', 'USD', '00000000-0000-4000-8000-0000000000a1'
);

insert into public.staff_members (restaurant_id, user_id, role, display_name, email, is_owner) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-0000000000a1', 'manager', 'Amara Okafor', 'manager@theglobe.test', true),
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-0000000000a2', 'kitchen', 'Luca Romano', 'kitchen@theglobe.test', false),
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-0000000000a3', 'waiter', 'Sofia Mendes', 'waiter@theglobe.test', false);

insert into public.restaurant_tables (id, restaurant_id, label, capacity, sort_order) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '1', 2, 1),
  ('a0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '2', 4, 2),
  ('a0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '3', 4, 3),
  ('a0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', '4', 6, 4),
  ('a0000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', '5', 8, 5);

insert into public.menu_categories (id, restaurant_id, name, description, sort_order) values
  ('c1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Food', 'From the grill, the oven and the pass.', 1),
  ('c1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Drinks', 'Soft, sparkling, brewed and poured.', 2),
  ('c1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Desserts', 'Worth saving room for.', 3);

insert into public.menu_items (id, restaurant_id, category_id, name, description, image_url, price_minor, tags, sort_order) values
  ('d1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001',
   'Globe Smash Burger', 'Two dry-aged beef patties, American cheese, pickles, shallot jam, brioche bun.',
   'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80&auto=format&fit=crop', 1400, '{popular}', 1),
  ('d1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001',
   'Wood-fired Margherita', 'San Marzano tomato, fior di latte, basil, olive oil. 48-hour dough.',
   'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80&auto=format&fit=crop', 1400, '{vegetarian}', 2),
  ('d1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001',
   'Rigatoni alla Vodka', 'Hand-rolled rigatoni, tomato cream, Calabrian chili, parmigiano.',
   'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800&q=80&auto=format&fit=crop', 1650, '{vegetarian,spicy}', 3),
  ('d1000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001',
   'Little Gem Caesar', 'Little gem lettuce, anchovy dressing, sourdough crumb, aged parmesan.',
   'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=800&q=80&auto=format&fit=crop', 1200, '{}', 4),
  ('d1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001',
   'Crispy Fries', 'Twice-cooked, sea salt, garlic aioli.',
   'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800&q=80&auto=format&fit=crop', 550, '{vegan}', 5),
  ('d1000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001',
   'Hot Honey Wings', 'Six wings, hot honey glaze, pickled celery, blue cheese dip.',
   'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=800&q=80&auto=format&fit=crop', 1300, '{spicy}', 6),
  ('d1000000-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000002',
   'Coca-Cola', 'Glass bottle, 355 ml.',
   'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=800&q=80&auto=format&fit=crop', 300, '{}', 1),
  ('d1000000-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000002',
   'House Lemonade', 'Fresh-squeezed lemons, a little mint.',
   'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=800&q=80&auto=format&fit=crop', 450, '{}', 2),
  ('d1000000-0000-4000-8000-000000000013', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000002',
   'Peach Iced Tea', 'Cold-brewed black tea, white peach.',
   'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&q=80&auto=format&fit=crop', 400, '{}', 3),
  ('d1000000-0000-4000-8000-000000000014', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000002',
   'Espresso', 'Single-origin, pulled to order.',
   'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=800&q=80&auto=format&fit=crop', 350, '{}', 4),
  ('d1000000-0000-4000-8000-000000000015', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000002',
   'Local IPA', 'Rotating Chicago IPA on draft, 16 oz.',
   'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=800&q=80&auto=format&fit=crop', 800, '{alcohol}', 5),
  ('d1000000-0000-4000-8000-000000000016', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000002',
   'House Red', 'Natural Montepulciano, juicy and bright.',
   'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80&auto=format&fit=crop', 1000, '{alcohol}', 6),
  ('d1000000-0000-4000-8000-000000000021', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000003',
   'Chocolate Olive Oil Cake', 'Dark chocolate, olive oil, flaky salt, crème fraîche.',
   'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&q=80&auto=format&fit=crop', 700, '{popular}', 1),
  ('d1000000-0000-4000-8000-000000000022', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000003',
   'Basque Cheesecake', 'Burnt top, creamy centre, seasonal fruit.',
   'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=800&q=80&auto=format&fit=crop', 800, '{}', 2),
  ('d1000000-0000-4000-8000-000000000023', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000003',
   'Tiramisu', 'Espresso-soaked savoiardi, mascarpone, cocoa.',
   'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800&q=80&auto=format&fit=crop', 850, '{}', 3),
  ('d1000000-0000-4000-8000-000000000024', '11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000003',
   'Gelato', 'Ask about today''s flavours.',
   'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=800&q=80&auto=format&fit=crop', 450, '{}', 4);

-- Variants (pizza size, wine pour, gelato scoops)
insert into public.menu_item_variants (id, restaurant_id, item_id, name, price_minor, sort_order) values
  ('e1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'd1000000-0000-4000-8000-000000000002', '10"', 1400, 1),
  ('e1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'd1000000-0000-4000-8000-000000000002', '14"', 1800, 2),
  ('e1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'd1000000-0000-4000-8000-000000000016', 'Glass', 1000, 1),
  ('e1000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'd1000000-0000-4000-8000-000000000016', 'Bottle', 3800, 2),
  ('e1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'd1000000-0000-4000-8000-000000000024', 'One scoop', 450, 1),
  ('e1000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'd1000000-0000-4000-8000-000000000024', 'Two scoops', 700, 2);

-- Modifiers (burger doneness + add-ons)
insert into public.menu_modifier_groups (id, restaurant_id, item_id, name, min_select, max_select, sort_order) values
  ('f1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'd1000000-0000-4000-8000-000000000001', 'Cook', 1, 1, 1),
  ('f1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'd1000000-0000-4000-8000-000000000001', 'Add-ons', 0, 3, 2),
  ('f1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'd1000000-0000-4000-8000-000000000005', 'Upgrade', 0, 1, 1);

insert into public.menu_modifiers (id, restaurant_id, group_id, name, price_delta_minor, sort_order) values
  ('f2000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'f1000000-0000-4000-8000-000000000001', 'Medium rare', 0, 1),
  ('f2000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'f1000000-0000-4000-8000-000000000001', 'Medium', 0, 2),
  ('f2000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'f1000000-0000-4000-8000-000000000001', 'Well done', 0, 3),
  ('f2000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'f1000000-0000-4000-8000-000000000002', 'Smoked bacon', 250, 1),
  ('f2000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'f1000000-0000-4000-8000-000000000002', 'Extra cheese', 150, 2),
  ('f2000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'f1000000-0000-4000-8000-000000000002', 'Avocado', 200, 3),
  ('f2000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'f1000000-0000-4000-8000-000000000003', 'Truffle & parmesan', 300, 1);

-- Taxes: exclusive sales tax on everything + liquor tax only on alcoholic items
insert into public.taxes (id, restaurant_id, name, rate_bps, is_inclusive, scope, sort_order) values
  ('7a000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Sales tax', 1025, false, 'all', 1),
  ('7a000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Liquor tax', 300, false, 'items', 2);
insert into public.tax_items (tax_id, item_id, restaurant_id) values
  ('7a000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000015', '11111111-1111-4111-8111-111111111111'),
  ('7a000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000016', '11111111-1111-4111-8111-111111111111');

-- ─────────────────────────────────────────────────────────────────────────────
-- Café Ubuntu (BIF — zero-decimal currency, VAT included in prices)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.restaurants (
  id, slug, name, tagline, description, hero_image_url, address, phone, instagram_handle,
  opening_hours, timezone, currency, created_by
) values (
  '22222222-2222-4222-8222-222222222222', 'cafe-ubuntu', 'Café Ubuntu',
  'Lakeside brochettes & Burundian coffee',
  'Grilled brochettes, isombe and fresh ndagala by Lake Tanganyika, with single-origin coffee from Kayanza. Prices include VAT.',
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1600&q=80&auto=format&fit=crop',
  'Boulevard du Lac, Bujumbura', '+257 22 00 00 00', 'cafeubuntu',
  '{"mon":[{"open":"07:00","close":"22:00"}],"tue":[{"open":"07:00","close":"22:00"}],"wed":[{"open":"07:00","close":"22:00"}],"thu":[{"open":"07:00","close":"22:00"}],"fri":[{"open":"07:00","close":"23:00"}],"sat":[{"open":"08:00","close":"23:00"}],"sun":[{"open":"08:00","close":"20:00"}]}',
  'Africa/Bujumbura', 'BIF', '00000000-0000-4000-8000-0000000000b1'
);

insert into public.staff_members (restaurant_id, user_id, role, display_name, email, is_owner) values
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-0000000000b1', 'manager', 'Eric Ndayishimiye', 'manager@cafeubuntu.test', true);

insert into public.restaurant_tables (id, restaurant_id, label, capacity, sort_order) values
  ('b0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Terrace 1', 4, 1),
  ('b0000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Terrace 2', 4, 2),
  ('b0000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Inside 1', 6, 3);

insert into public.menu_categories (id, restaurant_id, name, sort_order) values
  ('c2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Grill', 1),
  ('c2000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Boissons', 2);

insert into public.menu_items (restaurant_id, category_id, name, description, image_url, price_minor, sort_order) values
  ('22222222-2222-4222-8222-222222222222', 'c2000000-0000-4000-8000-000000000001', 'Brochettes de chèvre', 'Goat skewers, grilled over charcoal, with plantain.',
   'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=800&q=80&auto=format&fit=crop', 12000, 1),
  ('22222222-2222-4222-8222-222222222222', 'c2000000-0000-4000-8000-000000000001', 'Ndagala frits', 'Crispy Lake Tanganyika sardines, lime, pili-pili.', null, 10000, 2),
  ('22222222-2222-4222-8222-222222222222', 'c2000000-0000-4000-8000-000000000001', 'Isombe', 'Cassava leaves slow-cooked with peanut and palm oil.', null, 8000, 3),
  ('22222222-2222-4222-8222-222222222222', 'c2000000-0000-4000-8000-000000000002', 'Café Kayanza', 'Single-origin Burundian coffee.',
   'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80&auto=format&fit=crop', 2500, 1),
  ('22222222-2222-4222-8222-222222222222', 'c2000000-0000-4000-8000-000000000002', 'Primus', 'Local lager, 72 cl.', null, 3000, 2),
  ('22222222-2222-4222-8222-222222222222', 'c2000000-0000-4000-8000-000000000002', 'Jus de maracuja', 'Fresh passion fruit juice.', null, 2000, 3);

insert into public.taxes (restaurant_id, name, rate_bps, is_inclusive, scope) values
  ('22222222-2222-4222-8222-222222222222', 'TVA', 1800, true, 'all');

-- ─────────────────────────────────────────────────────────────────────────────
-- Fourteen days of history at The Globe (closed, paid tabs) for the dashboard
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_rid constant uuid := '11111111-1111-4111-8111-111111111111';
  v_tz constant text := 'America/Chicago';
  v_tables uuid[] := array(select id from public.restaurant_tables where restaurant_id = v_rid order by sort_order);
  v_items uuid[] := array(
    select id from public.menu_items
    where restaurant_id = v_rid and id not in (
      select item_id from public.menu_item_variants union select item_id from public.menu_modifier_groups where min_select > 0)
  );
  v_day integer;
  v_s integer;
  v_o integer;
  v_l integer;
  v_sessions integer;
  v_orders integer;
  v_open_at timestamptz;
  v_placed timestamptz;
  v_hour numeric;
  v_session_id uuid;
  v_table uuid;
  v_order_id uuid;
  v_number integer;
  v_item public.menu_items;
  v_pick uuid;
  v_qty integer;
  v_total bigint;
  v_rating integer;
  v_methods public.payment_method[] := array['stripe', 'cash', 'card', 'stripe', 'card']::public.payment_method[];
  v_review_bodies text[] := array[
    'The smash burger lives up to the hype. Ordering from the table was so easy.',
    'Lovely spot, great pasta. Loved being able to add dessert without flagging anyone down.',
    'Warm service and the cheesecake is unreal.',
    'Fast, friendly, and the pizza crust is perfect.',
    'Great wings, slightly loud on a Friday night.',
    'We kept ordering rounds all evening and the tab just worked. Brilliant.',
    'Solid neighbourhood place. Fries are addictive.',
    'Food was good but it took a while to come out.',
    null, null, null
  ];
begin
  for v_day in reverse 13..0 loop
    v_sessions := 6 + floor(random() * 7)::integer + case when extract(isodow from now() - make_interval(days => v_day)) in (5, 6) then 5 else 0 end;
    for v_s in 1..v_sessions loop
      -- Lunch and dinner peaks
      v_hour := case when random() < 0.38 then 11.75 + random() * 2.5 else 17.5 + random() * 4 end;
      v_open_at := (date_trunc('day', (now() - make_interval(days => v_day)) at time zone v_tz)
                    + make_interval(secs => (v_hour * 3600)::integer)) at time zone v_tz;
      -- Today: only tabs that would already be finished
      continue when v_open_at > now() - interval '2 hours';
      v_table := v_tables[1 + floor(random() * array_length(v_tables, 1))::integer];

      insert into public.table_sessions (restaurant_id, table_id, status, party_size, guest_count, opened_at, created_at)
      values (v_rid, v_table, 'closed', 1 + floor(random() * 5)::integer, 0, v_open_at, v_open_at)
      returning id into v_session_id;

      v_orders := 1 + floor(random() * 3)::integer;
      for v_o in 1..v_orders loop
        v_placed := v_open_at + make_interval(mins => (v_o - 1) * (15 + floor(random() * 25)::integer));
        update public.restaurants set next_order_number = next_order_number + 1 where id = v_rid
          returning next_order_number - 1 into v_number;
        insert into public.orders (restaurant_id, session_id, table_id, order_number, session_seq, status, currency,
                                   placed_at, accepted_at, preparing_at, ready_at, delivered_at, created_at)
        values (v_rid, v_session_id, v_table, v_number, v_o, 'delivered', 'USD',
                v_placed, v_placed + interval '1 minute', v_placed + interval '3 minutes',
                v_placed + interval '14 minutes', v_placed + interval '17 minutes', v_placed)
        returning id into v_order_id;

        for v_l in 1..(1 + floor(random() * 4)::integer) loop
          v_pick := v_items[1 + floor(random() * array_length(v_items, 1))::integer];
          select * into v_item from public.menu_items where id = v_pick;
          v_qty := 1 + floor(random() * 2)::integer;
          insert into public.order_items (order_id, restaurant_id, session_id, position, menu_item_id, name,
                                          applied_taxes, unit_price_minor, quantity, line_total_minor, created_at)
          values (v_order_id, v_rid, v_session_id, v_l, v_item.id, v_item.name,
                  public._item_taxes(v_rid, v_item.id, v_item.category_id),
                  v_item.price_minor, v_qty, v_item.price_minor * v_qty, v_placed);
        end loop;
        perform public.recompute_order_totals(v_order_id);
      end loop;

      update public.table_sessions set order_count = v_orders where id = v_session_id;
      select sum(total_minor) into v_total from public.orders where session_id = v_session_id;

      insert into public.payments (restaurant_id, session_id, method, status, amount_minor, currency, confirmed_at, created_at)
      values (v_rid, v_session_id, v_methods[1 + floor(random() * 5)::integer], 'succeeded', v_total, 'USD',
              v_placed + interval '45 minutes', v_placed + interval '45 minutes');

      update public.table_sessions
      set paid_at = v_placed + interval '45 minutes', closed_at = v_placed + interval '55 minutes'
      where id = v_session_id;

      if random() < 0.3 then
        v_rating := case when random() < 0.62 then 5 when random() < 0.75 then 4 else 3 end;
        insert into public.reviews (restaurant_id, session_id, rating, body, guest_name, is_featured, created_at)
        values (v_rid, v_session_id, v_rating,
                v_review_bodies[1 + floor(random() * array_length(v_review_bodies, 1))::integer],
                (array['Maya', 'Jordan', 'Priya', 'Tom', 'Aisha', 'Diego', null, null])[1 + floor(random() * 8)::integer],
                false, v_placed + interval '1 hour');
      end if;
    end loop;
  end loop;
end;
$$;

-- Feature the best written reviews; hide one that's off-topic (still counts toward the average).
update public.reviews set is_featured = true
where id in (
  select id from public.reviews
  where restaurant_id = '11111111-1111-4111-8111-111111111111' and rating = 5 and body is not null
  order by created_at desc limit 3
);
insert into public.reviews (restaurant_id, rating, body, guest_name, is_hidden, created_at)
values ('11111111-1111-4111-8111-111111111111', 4, 'Parking nearby is a nightmare, food was fine.', 'Sam', true, now() - interval '3 days');

-- ─────────────────────────────────────────────────────────────────────────────
-- Live floor right now: Table 2 eating, Table 4 just ordered, Table 5 wants the bill.
-- Tables 1 and 3 are free for the demo.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_rid constant uuid := '11111111-1111-4111-8111-111111111111';
  v_session uuid;
  v_order uuid;
  v_number integer;

begin
  -- Table 2: 3 guests, first round delivered, second round preparing
  insert into public.table_sessions (restaurant_id, table_id, party_size, guest_count, order_count, opened_at)
  values (v_rid, 'a0000000-0000-4000-8000-000000000002', 3, 0, 2, now() - interval '50 minutes')
  returning id into v_session;

  update public.restaurants set next_order_number = next_order_number + 1 where id = v_rid returning next_order_number - 1 into v_number;
  insert into public.orders (restaurant_id, session_id, table_id, order_number, session_seq, status, currency, placed_at,
                             accepted_at, preparing_at, ready_at, delivered_at)
  values (v_rid, v_session, 'a0000000-0000-4000-8000-000000000002', v_number, 1, 'delivered', 'USD', now() - interval '48 minutes',
          now() - interval '47 minutes', now() - interval '45 minutes', now() - interval '33 minutes', now() - interval '30 minutes')
  returning id into v_order;
  insert into public.order_items (order_id, restaurant_id, session_id, position, menu_item_id, name, applied_taxes, unit_price_minor, quantity, line_total_minor)
  select v_order, v_rid, v_session, x.pos, i.id, i.name, public._item_taxes(v_rid, i.id, i.category_id), i.price_minor, x.qty, i.price_minor * x.qty
  from (values (1, 'd1000000-0000-4000-8000-000000000006'::uuid, 1), (2, 'd1000000-0000-4000-8000-000000000005'::uuid, 2),
               (3, 'd1000000-0000-4000-8000-000000000011'::uuid, 3)) x(pos, item, qty)
  join public.menu_items i on i.id = x.item;
  perform public.recompute_order_totals(v_order);

  update public.restaurants set next_order_number = next_order_number + 1 where id = v_rid returning next_order_number - 1 into v_number;
  insert into public.orders (restaurant_id, session_id, table_id, order_number, session_seq, status, currency, placed_at, accepted_at, preparing_at)
  values (v_rid, v_session, 'a0000000-0000-4000-8000-000000000002', v_number, 2, 'preparing', 'USD', now() - interval '12 minutes',
          now() - interval '11 minutes', now() - interval '9 minutes')
  returning id into v_order;
  insert into public.order_items (order_id, restaurant_id, session_id, position, menu_item_id, name, applied_taxes, unit_price_minor, quantity, line_total_minor, notes)
  select v_order, v_rid, v_session, x.pos, i.id, i.name, public._item_taxes(v_rid, i.id, i.category_id), i.price_minor, x.qty, i.price_minor * x.qty, x.notes
  from (values (1, 'd1000000-0000-4000-8000-000000000003'::uuid, 2, 'One without chili'), (2, 'd1000000-0000-4000-8000-000000000004'::uuid, 1, null)) x(pos, item, qty, notes)
  join public.menu_items i on i.id = x.item;
  perform public.recompute_order_totals(v_order);

  -- Table 4: 5 guests, a brand-new pending order
  insert into public.table_sessions (restaurant_id, table_id, party_size, guest_count, order_count, opened_at)
  values (v_rid, 'a0000000-0000-4000-8000-000000000004', 5, 0, 1, now() - interval '6 minutes')
  returning id into v_session;
  update public.restaurants set next_order_number = next_order_number + 1 where id = v_rid returning next_order_number - 1 into v_number;
  insert into public.orders (restaurant_id, session_id, table_id, order_number, session_seq, status, currency, placed_at, notes)
  values (v_rid, v_session, 'a0000000-0000-4000-8000-000000000004', v_number, 1, 'pending', 'USD', now() - interval '2 minutes',
          'Celebrating a birthday!')
  returning id into v_order;
  insert into public.order_items (order_id, restaurant_id, session_id, position, menu_item_id, name, applied_taxes, unit_price_minor, quantity, line_total_minor)
  select v_order, v_rid, v_session, x.pos, i.id, i.name, public._item_taxes(v_rid, i.id, i.category_id), i.price_minor, x.qty, i.price_minor * x.qty
  from (values (1, 'd1000000-0000-4000-8000-000000000006'::uuid, 2), (2, 'd1000000-0000-4000-8000-000000000015'::uuid, 3),
               (3, 'd1000000-0000-4000-8000-000000000012'::uuid, 2)) x(pos, item, qty)
  join public.menu_items i on i.id = x.item;
  perform public.recompute_order_totals(v_order);

  -- Table 5: finished eating, bill requested (prefers card)
  insert into public.table_sessions (restaurant_id, table_id, status, party_size, guest_count, order_count, opened_at, bill_requested_at)
  values (v_rid, 'a0000000-0000-4000-8000-000000000005', 'bill_requested', 6, 0, 1, now() - interval '95 minutes', now() - interval '3 minutes')
  returning id into v_session;
  update public.restaurants set next_order_number = next_order_number + 1 where id = v_rid returning next_order_number - 1 into v_number;
  insert into public.orders (restaurant_id, session_id, table_id, order_number, session_seq, status, currency, placed_at,
                             accepted_at, preparing_at, ready_at, delivered_at)
  values (v_rid, v_session, 'a0000000-0000-4000-8000-000000000005', v_number, 1, 'delivered', 'USD', now() - interval '90 minutes',
          now() - interval '89 minutes', now() - interval '86 minutes', now() - interval '70 minutes', now() - interval '66 minutes')
  returning id into v_order;
  insert into public.order_items (order_id, restaurant_id, session_id, position, menu_item_id, name, applied_taxes, unit_price_minor, quantity, line_total_minor)
  select v_order, v_rid, v_session, x.pos, i.id, i.name, public._item_taxes(v_rid, i.id, i.category_id), i.price_minor, x.qty, i.price_minor * x.qty
  from (values (1, 'd1000000-0000-4000-8000-000000000001'::uuid, 4), (2, 'd1000000-0000-4000-8000-000000000003'::uuid, 2),
               (3, 'd1000000-0000-4000-8000-000000000005'::uuid, 3), (4, 'd1000000-0000-4000-8000-000000000011'::uuid, 6)) x(pos, item, qty)
  join public.menu_items i on i.id = x.item;
  perform public.recompute_order_totals(v_order);
  insert into public.table_requests (restaurant_id, session_id, table_id, type, preferred_method, created_at)
  values (v_rid, v_session, 'a0000000-0000-4000-8000-000000000005', 'bill', 'card', now() - interval '3 minutes');

  insert into public.notifications (restaurant_id, audience, recipient_roles, session_id, type, title, body, created_at) values
    (v_rid, 'staff', array['waiter']::public.staff_role[], v_session, 'request.bill', 'Bill requested — Table 5', 'Prefers card', now() - interval '3 minutes');
end;
$$;
