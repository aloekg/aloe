-- Narrows what the public anon key can do. Nothing here touches data, and nothing widens access,
-- so it is safe to run against production as-is.
--
-- Applied to production by hand through the Supabase SQL Editor on 2026-08-17, before the
-- schema was under migration control. Kept here so a fresh database reaches the same state:
-- every statement is idempotent, so `supabase db push` against production is a no-op.
--
-- Verification queries are at the bottom.

-- No explicit begin/commit: the migration runner already wraps each file in a transaction, and a
-- nested BEGIN/COMMIT would end that outer transaction early.

--------------------------------------------------------------------------------
-- 1. Customers could rewrite and delete their own orders.
--
-- "Users manage own orders" has no FOR clause, which means FOR ALL, and with no
-- WITH CHECK the USING expression is reused as the write check. Combined with
-- GRANT ALL on the table, any signed-in customer could PATCH their own order to
-- {"total": 0, "status": "delivered"} — or DELETE it — straight from DevTools.
--
-- The policy is entirely redundant: "own orders read" and "own orders insert"
-- already cover the two operations a customer legitimately needs. Admin writes go
-- through the service-role key and bypass RLS, so they are unaffected.
--------------------------------------------------------------------------------
drop policy if exists "Users manage own orders" on public.orders;

revoke update, delete, truncate, trigger on public.orders from anon, authenticated;

--------------------------------------------------------------------------------
-- 2. Admin identity in RLS disagreed with the application.
--
-- These two policies matched a hardcoded email address, while every other policy
-- and both application-side gates use app_metadata.role = 'admin'. The app never
-- relied on them (admin reads use the service role), so they were dead weight that
-- widened access inconsistently — and a second admin account would silently read
-- nothing through them.
--------------------------------------------------------------------------------
drop policy if exists "Admin can view all orders" on public.orders;
drop policy if exists "Admin can update orders" on public.orders;

--------------------------------------------------------------------------------
-- 3. TRUNCATE and TRIGGER survived the earlier write revoke on products.
--
-- TRUNCATE is *not* subject to RLS, and TRIGGER lets the grantee attach a trigger
-- to the table. Neither is reachable through PostgREST today, so this is hardening
-- rather than a live hole — but it is the kind of grant that turns a future mistake
-- into catalogue loss.
--------------------------------------------------------------------------------
revoke all on public.products from anon, authenticated;
grant select on public.products to anon, authenticated;

--------------------------------------------------------------------------------
-- 4. Admin-only tables keep write grants open, leaving RLS as the only guard.
--
-- categories/banners/brands are written exclusively by admin server actions using
-- the service role. Probing confirmed their policies currently hold, but products
-- looked equally safe until one permissive policy turned wide-open grants into a
-- write hole. Defence in depth: take the grants away too.
--
-- cart_items, favorites, profiles and orders are deliberately left with their
-- customer-facing grants — those tables ARE written by the anon client under RLS.
--------------------------------------------------------------------------------
revoke insert, update, delete, truncate, trigger on public.categories from anon, authenticated;
revoke insert, update, delete, truncate, trigger on public.banners from anon, authenticated;
revoke insert, update, delete, truncate, trigger on public.brands from anon, authenticated;

--------------------------------------------------------------------------------
-- 5. The purchase-count RPC should not be callable by the public.
--
-- Only checkout calls it, with the service-role key. Left open, it lets anyone
-- inflate purchase_count, which is what ranks "Популярные товары".
--------------------------------------------------------------------------------
revoke all on function public.increment_product_purchase_counts(jsonb) from public, anon, authenticated;
grant execute on function public.increment_product_purchase_counts(jsonb) to service_role;

-- Unqualified `update products` inside the function with a mutable search_path is
-- Supabase's function_search_path_mutable lint.
alter function public.increment_product_purchase_counts(jsonb) set search_path = public, pg_catalog;

--------------------------------------------------------------------------------
-- Verification — expect the orders policies to be SELECT/INSERT only, and no
-- write privileges for anon or authenticated on products/categories/banners/brands.
--------------------------------------------------------------------------------
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies where schemaname = 'public' and tablename = 'orders';
--
-- select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type)
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and grantee in ('anon', 'authenticated')
--   and table_name in ('products', 'categories', 'banners', 'brands', 'orders')
-- group by table_name, grantee
-- order by table_name, grantee;
