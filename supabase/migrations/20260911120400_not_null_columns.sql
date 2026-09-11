-- Closes the gap between the schema and what the application assumes.
--
-- Generating types/database.ts exposed columns that are nullable in Postgres while every consumer
-- treats them as mandatory. The gap is papered over at the boundary — the `as unknown as
-- ProductListRow[]` casts in product.service.ts and favorites.service.ts exist only because the
-- generated row type says `price: number | null` while `Product` says `price: number`. Making the
-- schema honest is what lets those casts go.
--
-- Scope is exactly the list from supabase/README.md. Columns that are already NOT NULL
-- (products.name, products.purchase_count, orders.items, orders.total, banners.image_url,
-- banners.type, every categories column) are left alone, and the deliberately optional ones
-- (old_price, description, seo_text, brand_id, thumbnail_url, orders.user_id for guest checkout,
-- orders.comment, orders.notified_at, banners.link, categories.parent_id/image_url) stay nullable.
--
-- Two groups, handled differently:
--
--   * `published`, `banners.active`, `banners.sort_order`, `orders.status`, `orders.created_at`
--     are backfilled with the value the application already substitutes for NULL, then locked.
--
--   * `price`, `image_url`, `category_id`, `category` cannot be invented — a NULL there is a
--     broken row, and defaulting a price to 0 would put a free product in the catalogue. The
--     guard below aborts and names the count instead. Find the rows with:
--
--       select id, name, price, image_url, category_id, category
--       from public.products
--       where price is null or image_url is null or category_id is null or category is null;
--
--     Fix or unpublish/delete them, then re-run.

--------------------------------------------------------------------------------
-- 1. Backfill.
--
-- Note the asymmetry with the column DEFAULTs, which are deliberately not changed:
-- `products.published` defaults to true and `banners.active` to true, but an existing NULL is
-- backfilled to **false**. That preserves today's behaviour rather than the default's: the public
-- products policy is `using (published = true)` and the banner query filters `active = true`, and
-- NULL satisfies neither — so a NULL row is invisible today and must stay invisible. Flipping it
-- to true would publish rows nobody chose to publish.
--------------------------------------------------------------------------------
update public.products set published = false where published is null;
update public.banners set active = false where active is null;
update public.banners set sort_order = 0 where sort_order is null;
update public.orders set status = 'new' where status is null;

-- created_at has no honest value for a row that lost it; now() at least keeps the /profile and
-- admin listings (both ordered by created_at) deterministic. Expected to affect zero rows.
update public.orders set created_at = now() where created_at is null;

--------------------------------------------------------------------------------
-- 2. Refuse to proceed while a column that cannot be defaulted still holds NULLs.
--------------------------------------------------------------------------------
do $$
declare
  n bigint;
begin
  select count(*) into n
    from public.products
   where price is null or image_url is null or category_id is null or category is null;

  if n > 0 then
    raise exception
      'NOT NULL migration aborted: % product row(s) hold NULL in price/image_url/category_id/category. See the query in this file''s header, fix those rows, then re-run.', n;
  end if;
end $$;

--------------------------------------------------------------------------------
-- 3. NOT NULL.
--------------------------------------------------------------------------------
alter table public.products alter column price       set not null;
alter table public.products alter column image_url   set not null;
alter table public.products alter column category_id set not null;
alter table public.products alter column category    set not null;
alter table public.products alter column published   set not null;

alter table public.banners  alter column active      set not null;
alter table public.banners  alter column sort_order  set not null;

alter table public.orders   alter column status      set not null;
alter table public.orders   alter column created_at  set not null;

--------------------------------------------------------------------------------
-- After applying: `npm run db:types && npm run typecheck`. The regenerated row types stop being
-- nullable, which is what allows the casts in services/product.service.ts (lines 25, 135, 167)
-- and services/favorites.service.ts (line 39) to be dropped.
--------------------------------------------------------------------------------
