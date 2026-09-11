-- Indexes for the queries the application actually runs.
--
-- Before this, the only index in the whole schema was products_name_trgm_idx. Foreign keys do not
-- get one automatically in Postgres, so products.category_id and products.brand_id were unindexed
-- too — which also makes every DELETE or UPDATE on categories/brands scan products.
--
-- Honest framing: at 3155 products and 18 orders none of this is currently a bottleneck; a
-- sequential scan over that is single-digit milliseconds. This is headroom for growth and it
-- removes the scans behind category/brand maintenance. Purely additive.
--
-- Applied to production by hand through the Supabase SQL Editor on 2026-08-17, before the
-- schema was under migration control. Kept here so a fresh database reaches the same state:
-- every statement is idempotent, so `supabase db push` against production is a no-op.
--
-- Plain CREATE INDEX rather than CONCURRENTLY: both the SQL Editor and `db push` wrap statements
-- in a transaction, where CONCURRENTLY is rejected, and at this table size the build holds the
-- write lock for milliseconds.

-- Storefront listings. Partial on `published` keeps them small, since every public query filters
-- on it and nothing public ever reads unpublished rows.
create index if not exists products_category_name_idx
  on public.products (category_id, name)
  where published;

create index if not exists products_brand_name_idx
  on public.products (brand_id, name)
  where published;

create index if not exists products_label_idx
  on public.products (label, id desc)
  where published;

-- /popular and the homepage carousel: `purchase_count > 0` then ORDER BY purchase_count DESC.
create index if not exists products_purchase_count_idx
  on public.products (purchase_count desc, id)
  where published;

-- Admin listing default sort, which is not restricted to published rows.
create index if not exists products_created_at_idx
  on public.products (created_at desc, id desc);

-- Unindexed foreign keys: without these, deleting a category or a brand scans all of products.
create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists products_brand_id_idx on public.products (brand_id);

-- /profile order history, on every page load.
create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);

-- The admin dashboard runs one head-count per status.
create index if not exists orders_status_idx on public.orders (status);

-- Per-user lookups on both sync tables.
create index if not exists cart_items_user_idx on public.cart_items (user_id);
create index if not exists favorites_user_idx on public.favorites (user_id);

-- The category tree is walked by parent_id everywhere.
create index if not exists categories_parent_idx on public.categories (parent_id);

--------------------------------------------------------------------------------
-- Verification: expect an index scan rather than "Seq Scan on products".
--------------------------------------------------------------------------------
-- explain analyze select id, name, price from public.products
-- where published and category_id in (102, 103) order by name limit 24;
--
-- explain analyze select id from public.products
-- where published and purchase_count > 0 order by purchase_count desc, id limit 10;
--
-- explain analyze select id, name from public.products
-- where published and name ilike '%крем%' limit 24;   -- three chars minimum for pg_trgm
