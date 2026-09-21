-- Repoints every stored storage URL from one Supabase project to another. Run it AFTER the files
-- themselves have been copied (scripts/migrate-storage.mjs) and the new project answers for them.
--
-- Why this is needed at all: image_url / thumbnail_url hold absolute URLs, not keys, so a row
-- still names the project it was uploaded to long after the database has moved. Three of the
-- places it is written down are not columns:
--
--   * products.description / seo_text — an image inserted into a Markdown description is referenced
--     by the text alone (it lives under `inline/` in the bucket, see scripts/prune-orphan-images.mjs)
--   * orders.items — a line item freezes its image URL at checkout, and order history and past
--     invoices render from that copy, never from the product
--   * the staging database, whose rows deliberately point at production's buckets (CODEBASE.md →
--     Environments). Run this there too, with the same new host, or stage.aloe.kg loses every photo
--     the day the old project is deleted.
--
-- Not covered here, because they are compiled in rather than stored: SPECIALS_BASE_URL
-- (lib/constants.ts) and the img-src origin in lib/csp.ts. Both need a code change and a redeploy.
--
-- Usage — fill the two hosts in, then either paste it into the Supabase SQL Editor of the project
-- being fixed, or run it with psql. It is one transaction: either every table moves or none does,
-- and re-running it is a no-op because the old host is no longer there to match.

do $$
declare
  old_host text := 'https://OLD_REF.supabase.co';
  new_host text := 'https://NEW_REF.supabase.co';
  moved    integer;
  leftover integer;
begin
  if old_host like '%OLD\_REF%' or new_host like '%NEW\_REF%' then
    raise exception 'Fill old_host and new_host in before running this.';
  end if;
  if old_host = new_host then
    raise exception 'old_host and new_host are both %, so there is nothing to rewrite.', old_host;
  end if;

  -- position() rather than LIKE: no pattern metacharacters to think about in a host name.
  update products set
      image_url     = replace(image_url, old_host, new_host),
      thumbnail_url = replace(thumbnail_url, old_host, new_host),
      description   = replace(description, old_host, new_host),
      seo_text      = replace(seo_text, old_host, new_host)
    where position(old_host in coalesce(image_url, '')) > 0
       or position(old_host in coalesce(thumbnail_url, '')) > 0
       or position(old_host in coalesce(description, '')) > 0
       or position(old_host in coalesce(seo_text, '')) > 0;
  get diagnostics moved = row_count;
  raise notice 'products: % rows', moved;

  update categories set image_url = replace(image_url, old_host, new_host)
    where position(old_host in coalesce(image_url, '')) > 0;
  get diagnostics moved = row_count;
  raise notice 'categories: % rows', moved;

  update banners set image_url = replace(image_url, old_host, new_host)
    where position(old_host in coalesce(image_url, '')) > 0;
  get diagnostics moved = row_count;
  raise notice 'banners: % rows', moved;

  -- items is a jsonb array of line items; the host appears inside their image_url strings. Text
  -- replacement over the whole document is safe here and stays valid JSON: a host name contains
  -- nothing JSON escapes.
  update orders set items = replace(items::text, old_host, new_host)::jsonb
    where position(old_host in items::text) > 0;
  get diagnostics moved = row_count;
  raise notice 'orders: % rows', moved;

  select count(*) into leftover
    from products
    where position(old_host in coalesce(image_url, '')) > 0
       or position(old_host in coalesce(thumbnail_url, '')) > 0
       or position(old_host in coalesce(description, '')) > 0
       or position(old_host in coalesce(seo_text, '')) > 0;
  leftover := leftover
    + (select count(*) from categories where position(old_host in coalesce(image_url, '')) > 0)
    + (select count(*) from banners where position(old_host in coalesce(image_url, '')) > 0)
    + (select count(*) from orders where position(old_host in items::text) > 0);
  if leftover > 0 then
    raise exception 'still % row(s) naming %, rolling back', leftover, old_host;
  end if;
  raise notice 'no row names % any more', old_host;
end $$;

-- Read-only check, for afterwards or for a project you only want to inspect. Every count should be
-- zero for the old host and non-zero for the new one.
--
-- select 'products.image_url' as where_, count(*) from products where image_url like '%OLD_REF%'
-- union all select 'products.thumbnail_url', count(*) from products where thumbnail_url like '%OLD_REF%'
-- union all select 'products.description',   count(*) from products where description like '%OLD_REF%'
-- union all select 'products.seo_text',      count(*) from products where seo_text like '%OLD_REF%'
-- union all select 'categories.image_url',   count(*) from categories where image_url like '%OLD_REF%'
-- union all select 'banners.image_url',      count(*) from banners where image_url like '%OLD_REF%'
-- union all select 'orders.items',           count(*) from orders where items::text like '%OLD_REF%';
