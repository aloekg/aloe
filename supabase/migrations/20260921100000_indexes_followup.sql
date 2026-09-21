-- The indexes 20260911120100_indexes.sql did not reach. Same framing as that file: at 3155
-- products and 18 orders none of this is a bottleneck today, and every statement is purely
-- additive and idempotent, so `db push` against a database that already has them is a no-op.
--
-- Plain CREATE INDEX rather than CONCURRENTLY, for the same reason as the parent migration: both
-- the SQL Editor and `db push` wrap statements in a transaction, where CONCURRENTLY is rejected.
--
-- NOTE: whether the parent migration itself is applied to production cannot be checked from the
-- repository — indexes are invisible through PostgREST (see supabase/README.md). Confirm with the
-- first verification query at the bottom before reading anything into a slow query.

--------------------------------------------------------------------------------
-- 1. The two remaining unindexed foreign keys.
--
-- 20260911120100:42-44 indexed products.category_id and products.brand_id with the reasoning
-- "without these, deleting a category or a brand scans all of products". cart_items.product_id and
-- favorites.product_id are the same shape and were missed: both reference products ON DELETE
-- CASCADE, so every deleteProduct() and every bulkUpdateProducts() (app/admin/actions.ts) makes
-- Postgres scan both tables in full to find the rows to cascade.
--
-- cart_items and favorites each already carry a UNIQUE (user_id, product_id) index, but it leads
-- with user_id, so it cannot serve a lookup by product alone.
--------------------------------------------------------------------------------
create index if not exists cart_items_product_idx on public.cart_items (product_id);
create index if not exists favorites_product_idx  on public.favorites  (product_id);

--------------------------------------------------------------------------------
-- 2. Orders sorted and range-scanned by date, without a user.
--
-- orders_user_created_idx (20260911120100:47) leads with user_id, which serves /profile and
-- nothing else. orders_unnotified_idx (20260911120200:23) is partial on notified_at is null.
-- Neither can serve the two queries that read orders by date across all customers:
--
--   getAdminOrders            services/order.service.ts — order by created_at desc, id desc
--   loadAnalyticsOrders       services/analytics.service.ts — created_at >= / < plus the same sort
--
-- The trailing id matches the tiebreak both queries apply, so the sort is satisfied by the index
-- rather than by a sort node on top of it.
--------------------------------------------------------------------------------
create index if not exists orders_created_at_idx on public.orders (created_at desc, id desc);

--------------------------------------------------------------------------------
-- 3. Legacy product URLs.
--
-- lib/legacy-redirect.ts resolves an old JoomShopping address with
--
--   .like("product_url", "%/product/view/<cat>/<id>.html")
--
-- a leading wildcard, which no btree index can serve — and product_url has no index of any kind,
-- so each of the 2415 old product URLs still in Google's index costs a full scan of products. The
-- route caches for a day (revalidate = 86400), which bounds the rate, not the cost.
--
-- pg_trgm is already installed (20260817053308_remote_schema.sql:22) and already backs
-- products_name_trgm_idx; a trigram index supports a leading wildcard. The opclass is schema-
-- qualified because the extension lives in `public`, matching the existing index.
--------------------------------------------------------------------------------
create index if not exists products_product_url_trgm_idx
  on public.products using gin (product_url public.gin_trgm_ops);

--------------------------------------------------------------------------------
-- Deliberately NOT added
--------------------------------------------------------------------------------
-- products(price): the category page sorts by price only under `in (category_id, …)`, which
--   products_category_name_idx already narrows to a few hundred rows.
-- trgm on orders.customer_name / customer_phone: the admin search is an ilike over 18 rows.
-- banners / categories: tens of rows each, primary key only, and that is the right answer.
--
--------------------------------------------------------------------------------
-- Verification
--------------------------------------------------------------------------------
-- Is the parent migration actually applied? Expect products_category_name_idx, products_label_idx,
-- orders_user_created_idx, categories_parent_idx… alongside everything created above:
--
--   select tablename, indexname from pg_indexes
--    where schemaname = 'public'
--      and tablename in ('products','orders','cart_items','favorites','categories')
--    order by tablename, indexname;
--
-- Expect an index scan, not "Seq Scan on cart_items" / "Seq Scan on favorites":
--   explain analyze delete from public.cart_items where product_id = -1;
--
-- Expect an index scan on orders_created_at_idx:
--   explain analyze select id, total from public.orders order by created_at desc, id desc limit 15;
--
-- Expect a bitmap index scan on products_product_url_trgm_idx:
--   explain analyze select id from public.products
--    where product_url like '%/product/view/21/6865.html' and published limit 1;
