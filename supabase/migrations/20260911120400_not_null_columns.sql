-- Closes the gap between the schema and what the application assumes.
--
-- Generating types/database.ts exposed columns that are nullable in Postgres while every consumer
-- treats them as mandatory. The gap is papered over at the boundary — the `as unknown as
-- ProductListRow[]` casts in product.service.ts and favorites.service.ts exist only because the
-- generated row type says `price: number | null` while `Product` says `price: number`.
--
-- Scope is the list from supabase/README.md **minus `products.category_id`/`category`**. The first
-- run of this migration aborted on them, and the data was right: 91 products carry a NULL
-- category_id (their stale `category` text label is still there, price and image intact, all of
-- them unpublished). They were orphaned by `fk_products_category_id ON DELETE SET NULL` — deleting
-- an in-use category used to strip category_id from its products, see the comment in
-- `deleteCategory` (app/admin/actions.ts). So "no category yet" is a state that really occurs and
-- that an admin has to resolve by hand; NOT NULL would just block the migration forever.
--
-- What matters is narrower, and is expressed as a CHECK in step 4: a **published** product must
-- have a category. Nothing public ever reads an unpublished row, and that is the invariant the
-- storefront actually depends on. The FK itself is fixed in the next migration.
--
-- Columns already NOT NULL (products.name, products.purchase_count, orders.items, orders.total,
-- banners.image_url, banners.type, every categories column) are left alone, and the deliberately
-- optional ones (old_price, description, seo_text, brand_id, thumbnail_url, orders.user_id for
-- guest checkout, orders.comment, orders.notified_at, banners.link, categories.parent_id and
-- image_url) stay nullable.

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

-- A product that still has its category_id gets the text label back from the tree. `category` is
-- denormalised — the admin list and the product page fall back to it — and `upsertCategory`
-- already keeps it in step on rename. Expected to affect zero rows; here so the column cannot
-- drift out of sync unnoticed.
update public.products p
   set category = c.name
  from public.categories c
 where p.category_id = c.id
   and p.category is null;

--------------------------------------------------------------------------------
-- 2. Refuse to proceed while a column that cannot be defaulted still holds NULLs.
--
-- price and image_url cannot be invented: defaulting a price to 0 would put a free product in the
-- catalogue. Verified empty at the time of writing; the guard is for whatever the data does later.
--
--   select id, name, price, image_url from public.products
--   where price is null or image_url is null;
--------------------------------------------------------------------------------
do $$
declare
  n bigint;
begin
  select count(*) into n from public.products where price is null or image_url is null;

  if n > 0 then
    raise exception
      'NOT NULL migration aborted: % product row(s) hold NULL in price/image_url. See the query in this file''s header, fix those rows, then re-run.', n;
  end if;
end $$;

--------------------------------------------------------------------------------
-- 3. NOT NULL.
--------------------------------------------------------------------------------
alter table public.products alter column price      set not null;
alter table public.products alter column image_url  set not null;
alter table public.products alter column published  set not null;

alter table public.banners  alter column active     set not null;
alter table public.banners  alter column sort_order set not null;

alter table public.orders   alter column status     set not null;
alter table public.orders   alter column created_at set not null;

--------------------------------------------------------------------------------
-- 4. A published product must be categorised.
--
-- This is what NOT NULL on category_id was reaching for. An uncategorised draft stays legal — the
-- 91 orphans above are unpublished and invisible — but it can no longer be published in that
-- state, which is exactly the failure the old FK produced: products that stayed published,
-- searchable and in the sitemap while dropping out of every catalogue query.
--
-- If this fails, a published row is uncategorised right now. Find it with:
--
--   select id, name, category, published from public.products
--   where published and (category_id is null or category is null);
--------------------------------------------------------------------------------
alter table public.products
  drop constraint if exists products_published_has_category;

alter table public.products
  add constraint products_published_has_category
  check (not published or (category_id is not null and category is not null));

--------------------------------------------------------------------------------
-- After applying: `npm run db:types && npm run typecheck`. price/image_url/published stop being
-- nullable in the generated row types. `category_id` stays nullable by design, and a CHECK is not
-- visible to type generation, so the casts in services/product.service.ts and
-- favorites.service.ts get narrower but do not disappear entirely.
--
-- The 91 orphans still need categories. They group by the stale label they kept, which is what the
-- admin needs to assign them in bulk (Товары → фильтр → массовое редактирование):
--
--   select category as old_label, count(*), min(id), max(id)
--   from public.products
--   where category_id is null
--   group by category
--   order by count(*) desc;
--------------------------------------------------------------------------------
