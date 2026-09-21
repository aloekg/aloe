-- Constraints the application has always assumed and the schema never stated, plus three dead
-- policies. Nothing here modifies a row; every statement either adds a constraint or removes a
-- policy, and each is wrapped so a re-run is a no-op.
--
-- Three of these will ABORT the migration rather than apply if the data does not already satisfy
-- them. That is deliberate — it is the check, performed by the database instead of by hand. Run
-- the queries in the "Pre-flight" block below against production first, and rehearse with
-- `npm run db:push:stage`: staging carries a copy of the production catalogue, so sections 1 and 4
-- are exercised there for real (its orders are mock data, so section 2 is not).
--
--------------------------------------------------------------------------------
-- Pre-flight — every one of these must return zero rows
--------------------------------------------------------------------------------
-- 1. Categories pointing at a parent that does not exist:
--      select c.id, c.name, c.parent_id from public.categories c
--       where c.parent_id is not null
--         and not exists (select 1 from public.categories p where p.id = c.parent_id);
--
-- 2. Order statuses outside the five the application writes:
--      select distinct status from public.orders
--       where status not in ('new','confirmed','processing','delivered','cancelled');
--
-- 4. Duplicate external ids:
--      select external_id, count(*) from public.products
--       where external_id is not null group by external_id having count(*) > 1;

--------------------------------------------------------------------------------
-- 1. categories.parent_id had no foreign key at all.
--
-- The whole category tree hangs off this column — three levels of it (CODEBASE.md, "Sub-
-- subcategories"), walked by /catalog/[slug], the sitemap, the product breadcrumbs and the admin
-- — and nothing ever constrained it. Both CODEBASE.md and scripts/seed-staging.mjs describe it as
-- a self-referential FK, which is what makes the gap worth closing rather than documenting: a
-- parent_id pointing at a deleted id does not error, it makes the entire subtree invisible in the
-- admin and on the storefront at once, with no failure anywhere to notice.
--
-- RESTRICT, not CASCADE. deleteCategory() (app/admin/actions.ts) already counts children and
-- refuses to delete a parent, so the database should state the same rule; CASCADE would silently
-- delete a subtree that the admin is explicitly prevented from deleting. ON UPDATE CASCADE matches
-- fk_products_category_id.
--------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'categories_parent_id_fkey' and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_parent_id_fkey
      foreign key (parent_id) references public.categories(id) on update cascade on delete restrict;
  end if;
end $$;

--------------------------------------------------------------------------------
-- 2. orders.status accepted any text.
--
-- The five values live in ORDER_STATUS (lib/constants.ts) and updateOrderStatus() checks against
-- it, so today the column is correct by caller. 20260916090000_orders_insert_lockdown.sql:17-19
-- describes exactly what that is worth on its own: it walks through an INSERT landing
-- {"total": 0, "status": "delivered"} and notes "orders.status has no CHECK constraint … so
-- 'delivered' is as writable as 'new'". The hole it describes is closed; the missing constraint
-- it names is not.
--------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'orders_status_check' and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_status_check
      check (status in ('new', 'confirmed', 'processing', 'delivered', 'cancelled'));
  end if;
end $$;

--------------------------------------------------------------------------------
-- 3. The "admin write" policies are wider than their name.
--
-- On categories, brands and banners (20260817053308_remote_schema.sql:139, :176, :253) each is
-- written with no FOR clause and no TO clause — so FOR ALL, to role PUBLIC — admitting every write
-- to anyone whose JWT carries app_metadata.role = 'admin'.
--
-- They are inert today only because 20260911120000:63-65 revoked insert/update/delete from anon
-- and authenticated, and they were inert before that only by luck. Nothing uses them: every admin
-- write goes through createAdminClient(), which is the service role and bypasses RLS entirely.
-- Dropping them is the same call 20260911120000:38-39 made for the email-matching orders policies,
-- for the same reason — dead weight that states the intent incorrectly, and that a future GRANT
-- would quietly reactivate.
--
-- The `public read` policy on each table stays: that one the storefront genuinely depends on.
--------------------------------------------------------------------------------
drop policy if exists "admin write" on public.categories;
drop policy if exists "admin write" on public.brands;
drop policy if exists "admin write" on public.banners;

--------------------------------------------------------------------------------
-- 4. products.external_id is a join key with no uniqueness.
--
-- It is the key the old-site sync matches on (scripts/joomla/sync-products.mjs), and
-- scripts/joomla/diff-products.mjs counts duplicates on it — which it only needs to do because the
-- schema permits them. A duplicate makes the sync ambiguous: two rows claim the same JoomShopping
-- product and which one gets the update is whatever order the scan returned.
--
-- NULL is unconstrained by a UNIQUE constraint in Postgres, so the products created in the new
-- admin (which have no external_id) are unaffected — that is the majority of new rows.
--------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'products_external_id_key' and conrelid = 'public.products'::regclass
  ) then
    alter table public.products add constraint products_external_id_key unique (external_id);
  end if;
end $$;

--------------------------------------------------------------------------------
-- Verification
--------------------------------------------------------------------------------
-- Constraints — expect categories_parent_id_fkey (f), orders_status_check (c),
-- products_external_id_key (u):
--   select conrelid::regclass as table, conname, contype, pg_get_constraintdef(oid)
--     from pg_constraint
--    where connamespace = 'public'::regnamespace
--      and conname in ('categories_parent_id_fkey','orders_status_check','products_external_id_key');
--
-- Policies — expect only "public read" on the three tables, and nothing named "admin write":
--   select tablename, policyname, cmd, roles from pg_policies
--    where schemaname = 'public' and tablename in ('categories','brands','banners')
--    order by tablename, policyname;
--
-- And that the admin still writes fine, since it never used those policies: edit a category, a
-- brand and a banner in /admin after applying.
