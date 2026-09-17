-- Defence in depth around the anon key: the grants and function settings that 20260911120000
-- did not reach. Nothing here is a live hole today — each one is a way a future mistake turns
-- into a real one. Every statement only narrows access, and all are idempotent.

--------------------------------------------------------------------------------
-- 1. Every FUTURE function in `public` is executable by the anon key by default.
--
-- The db pull baseline carries these (remote_schema.sql:28, :34):
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;
--
-- Nothing has ever revoked them. Both existing functions are closed only because each one
-- explicitly revokes itself afterwards (20260911120000:73, 20260911120300:71) — a convention held
-- by hand, on a default that silently opens the next SECURITY DEFINER function anyone writes.
-- Flip the default; the explicit `grant execute ... to service_role` lines keep working.
--
-- The matching ON TABLES defaults (remote_schema.sql:24, :30) are left alone on purpose: a new
-- table gets RLS from the `ensure_rls` event trigger (remote_schema.sql:452) and no policy, so it
-- denies everything regardless of the grant. Routines have no such backstop.
--------------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on routines from anon;
alter default privileges for role postgres in schema public revoke all on routines from authenticated;

--------------------------------------------------------------------------------
-- 2. TRUNCATE and TRIGGER on the customer-facing tables.
--
-- 20260911120000 stripped exactly these from products/categories/banners/brands with the reasoning
-- "TRUNCATE is *not* subject to RLS, and TRIGGER lets the grantee attach a trigger to the table"
-- (:42-47) — and then deliberately skipped profiles/cart_items/favorites because those tables ARE
-- written by the anon client (:60-61). That is true of INSERT/UPDATE/DELETE. It is not true of
-- TRUNCATE, which RLS does not filter, or of TRIGGER, which RLS has nothing to say about.
--
-- Spelled as revoke-all-then-grant-back rather than `revoke truncate, trigger` so the privilege
-- set is stated positively and MAINTAIN (PG17) is covered without naming a keyword that does not
-- exist on every version. What each table actually needs:
--
--   profiles     select + insert + update   services/profile.service.ts:18 upserts
--   cart_items   select + insert + update + delete   cart.service.ts upserts and deletes
--   favorites    select + insert + delete   favorites.service.ts:24, :29
--
-- Sequence grants (remote_schema.sql:314-318 and friends) are untouched — revoking USAGE there
-- would break the very inserts this keeps.
--------------------------------------------------------------------------------
revoke all on public.profiles   from anon, authenticated;
revoke all on public.cart_items from anon, authenticated;
revoke all on public.favorites  from anon, authenticated;

grant select, insert, update         on public.profiles   to anon, authenticated;
grant select, insert, update, delete on public.cart_items to anon, authenticated;
grant select, insert, delete         on public.favorites  to anon, authenticated;

--------------------------------------------------------------------------------
-- 3. SECURITY DEFINER search_path resolves `public` before `pg_catalog`.
--
-- Both functions are pinned (that is what satisfies Supabase's function_search_path_mutable lint),
-- but pinned to `public, pg_catalog` — so anything created in `public` shadows the catalogue
-- *inside* a definer-rights function owned by postgres. Exploiting it needs CREATE on schema
-- public, which anon and authenticated do not hold, so this is hardening rather than a hole.
--
-- `search_path = ''` is the stronger form: pg_catalog is always searched implicitly, so built-ins
-- and operators still resolve, but nothing else does. It requires every reference to be schema-
-- qualified. rate_limit_hit's body already qualifies everything as public.rate_limits;
-- increment_product_purchase_counts does not, so it is rewritten in step 4.
--------------------------------------------------------------------------------
alter function public.rate_limit_hit(text, text, integer, interval) set search_path = '';

--------------------------------------------------------------------------------
-- 4. increment_product_purchase_counts takes qty on trust.
--
-- `purchase_count = purchase_count + i.qty` over a caller-supplied jsonb, with no bound on qty and
-- no check that the id is a real product (remote_schema.sql:56-66). purchase_count is what ranks
-- /popular and the homepage carousel, and it is deliberately not derivable from the orders table
-- (see scripts/purge-test-data.mjs --reset-counts), so a skewed value is not self-correcting.
--
-- Only service_role can call it and app/checkout/actions.ts:145 feeds it the already-parsed quote,
-- whose lines parseLines() has capped at qty <= 999 (lib/order-pricing.ts). Restating that bound
-- in the function makes it true by construction instead of true by caller — which is the property
-- that matters the day a second caller appears.
--
-- Also adds the `public.` qualification that step 3's search_path requires, and keeps the function
-- LANGUAGE sql with invoker rights exactly as it was. CREATE OR REPLACE preserves privileges; the
-- revoke/grant pair is restated anyway so this file stands on its own.
--------------------------------------------------------------------------------
create or replace function public.increment_product_purchase_counts(items jsonb)
  returns void
  language sql
  set search_path = ''
as $function$
  update public.products p
  set purchase_count = purchase_count + i.qty
  from jsonb_to_recordset(items) as i(id int, qty int)
  where p.id = i.id
    and i.qty between 1 and 999;
$function$;

revoke all on function public.increment_product_purchase_counts(jsonb) from public, anon, authenticated;
grant execute on function public.increment_product_purchase_counts(jsonb) to service_role;

--------------------------------------------------------------------------------
-- 5. rls_auto_enable() keeps its EXECUTE grant — deliberately.
--
-- It is a SECURITY DEFINER function that the dump grants to anon and authenticated
-- (remote_schema.sql:73-107), which looks like it belongs in step 1's clean-up. It is left alone:
-- it returns event_trigger, so PostgREST cannot expose it and it errors outside event-trigger
-- context, meaning the grant buys an attacker nothing. Against that, it is Supabase-managed and it
-- backs the `ensure_rls` event trigger that step 1 above names as the reason the ON TABLES default
-- privileges are safe to leave. Revoking a privilege on the function behind that backstop, to close
-- nothing, is the wrong trade. Noted here so the next audit does not re-discover it as an oversight.
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- 6. Drop image/svg+xml from the two public buckets that allow it.
--
-- 20260915090000 allows it on `banners` and `categories`. Both buckets are public and nothing signs
-- a URL, so an SVG served from them is script executing on the Supabase storage origin — which is
-- exactly why ALLOWED_IMAGE_TYPES in app/admin/actions.ts:41-46 excludes it. That app-level list is
-- currently the only thing stopping it, and it only covers what goes through the admin actions;
-- anything else holding the service-role key writes straight past it. The buckets should say no
-- too. Nothing has ever uploaded an SVG — checked against production on 2026-09-16, see below.
--
-- `categories` matters most: uploadImage() stores those objects exactly as uploaded, with no sharp
-- pass, so allowed_mime_types is the real validation rather than a second opinion. Aligning it with
-- ALLOWED_IMAGE_TYPES also fixes a standing mismatch — image/avif passed the action's check and was
-- then rejected by the bucket, surfacing a raw Supabase error to the admin.
--
-- What is deliberately NOT narrowed further: `product-images` keeps jpeg/png (it never allowed SVG,
-- so there is nothing here to fix), and `banners` keeps them too. Both are written as re-encoded
-- WebP today, so "webp only" would describe the app more precisely — but production still holds
-- objects predating that (product-images: 1 jpeg, 7 png; banners: 4 jpeg, 1 application/octet-stream),
-- none of which can execute, and tightening a bucket past what it stores buys no security while
-- making those objects unreplaceable in place. gif goes because it is in neither allowlist.
--
-- `update`, not `insert ... on conflict`: the parent migration's `on conflict (id) do nothing`
-- deliberately never reconciles settings, so an insert here would be a no-op wherever the buckets
-- already exist. Narrowing allowed_mime_types does not touch objects already stored, and does not
-- affect reads at all — only future uploads.
--
-- Same caveat as the parent migration: if `db push` reports "permission denied for table buckets",
-- run these two statements from the dashboard's SQL Editor and then record the migration as
-- applied — npx supabase migration repair --status applied 20260916090100

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'banners';

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
 where id = 'categories';

--------------------------------------------------------------------------------
-- Verification
--------------------------------------------------------------------------------
-- Default privileges on routines — expect no anon/authenticated rows for ROUTINES:
--   select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl;
--
-- Table grants — expect exactly the sets listed in step 2, and no TRUNCATE/TRIGGER anywhere:
--   select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type)
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('anon', 'authenticated')
--   group by table_name, grantee order by table_name, grantee;
--
-- Function settings — expect search_path="" on both:
--   select proname, prosecdef, proconfig from pg_proc
--   where pronamespace = 'public'::regnamespace
--     and proname in ('rate_limit_hit', 'increment_product_purchase_counts', 'rls_auto_enable');
--
-- Buckets:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;
--
-- Anything already stored as SVG (narrowing the list does not delete it, but it should be replaced):
--   select bucket_id, name, metadata->>'mimetype' from storage.objects
--   where bucket_id in ('banners', 'categories') and metadata->>'mimetype' = 'image/svg+xml';
