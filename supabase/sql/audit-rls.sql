-- Read-only audit of row level security. Nothing here modifies data or policies —
-- run it in the Supabase SQL Editor and review the output.
--
-- Read sections 2 and 5 together. A policy only matters where a GRANT lets the role reach the
-- table, and a grant only matters where a policy admits the row — so neither half is a finding on
-- its own, and neither half is a clean bill of health on its own. The 2026-09-16 audit found an
-- orders INSERT that had been open since the 2026-09-11 hardening precisely because the policy
-- list was read without the grant list beside it.

-- 1. Which tables have RLS enabled at all?
--    Any `false` on orders / profiles / cart_items / favorites is a finding.
select
  c.relname                as table_name,
  c.relrowsecurity         as rls_enabled,
  c.relforcerowsecurity    as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- 2. Every policy, in full.
--    On `orders`, check the SELECT policy specifically: `user_id` is nullable for guest
--    checkout, and `using (user_id = auth.uid())` evaluates to NULL — not false — on those
--    rows. That is safe on its own, but an `or` branch added later can expose guest orders.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- 3. Tables with RLS on but no policy at all — these deny everything to anon/authenticated,
--    which silently reads as "empty" in the app (see the swallowed-error finding).
select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  );

-- 4. Confirm the purchase-count RPC exists and is what checkout expects.
--    `app/checkout/actions.ts` now logs when this call errors, but the function should be here.
select
  p.proname       as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef     as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'increment_product_purchase_counts';

-- 5. What anon and authenticated may actually do to each table — the other half of section 2.
--    Expected as of 2026-09-16:
--      banners, brands, categories, products   select
--      orders                                  select
--      profiles                                select, insert, update
--      cart_items                              select, insert, update, delete
--      favorites                               select, insert, delete
--      rate_limits                             (absent — every grant revoked)
--      reviews                                 (absent here — column-level only, see 5a)
--    Anything beyond that list is a finding, and TRUNCATE in particular is not filtered by RLS.
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- 5a. Column-level grants — the one table where the grant is narrower than the table. Expected as
--     of 2026-09-24: reviews → id, product_id, rating, body, author_name, status, created_at for
--     both roles, and NOT user_id / order_id. A table-wide `select` reappearing on reviews (it would
--     show up in section 5 as well) is a finding.
select
  grantee,
  string_agg(column_name, ', ' order by column_name) as columns
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'reviews'
  and grantee in ('anon', 'authenticated')
group by grantee
order by grantee;

-- 6. Functions: who may execute them, whether they run with definer rights, and how their
--    search_path is pinned. A SECURITY DEFINER function that anon may execute is the shortest
--    path out of RLS there is, and `search_path = ''` is the form that cannot be shadowed
--    (pg_catalog is still searched implicitly, so built-ins keep resolving).
--    Expected: increment_product_purchase_counts and rate_limit_hit — service_role only.
select
  p.proname                                  as function_name,
  pg_get_function_identity_arguments(p.oid)  as arguments,
  p.prosecdef                                as security_definer,
  p.proconfig                                as settings,
  array(
    select grantee from information_schema.routine_privileges rp
    where rp.specific_schema = 'public'
      and rp.specific_name = p.proname || '_' || p.oid
      and rp.grantee in ('anon', 'authenticated', 'PUBLIC')
  )                                          as public_grantees
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- 7. Default privileges — what a table or function created *tomorrow* inherits.
--    Sections 5 and 6 describe today. This is the one that decides whether the next migration
--    quietly ships an anon-executable function. Expect no ROUTINES entry for anon/authenticated.
select
  defaclrole::regrole  as granted_by,
  case defaclobjtype
    when 'r' then 'tables' when 'S' then 'sequences'
    when 'f' then 'functions' when 'T' then 'types' else defaclobjtype::text
  end                  as object_type,
  defaclacl            as privileges
from pg_default_acl a
join pg_namespace n on n.oid = a.defaclnamespace
where n.nspname = 'public';

-- 8. Storage. Sections 1-3 filter on `schemaname = 'public'`, so a policy added to
--    storage.objects by hand in the dashboard is invisible to them — and storage is where the
--    admin uploads land. The intended posture is NO policies at all: the buckets are public for
--    reads, and every write goes through the service-role key, which bypasses RLS. Any row here
--    means someone widened it outside the migrations.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
order by tablename, cmd, policyname;

--    And the buckets themselves. `public` is true by design (nothing signs a URL);
--    allowed_mime_types is the real validation on `categories`, whose objects are stored exactly
--    as uploaded. image/svg+xml on a public bucket is script on the storage origin — it must not
--    reappear in this list.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;
