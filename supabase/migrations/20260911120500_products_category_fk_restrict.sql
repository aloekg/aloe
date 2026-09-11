-- Stops the database from orphaning products when a category is deleted.
--
-- `fk_products_category_id` was ON DELETE SET NULL, so deleting an in-use category silently
-- stripped `category_id` from its products: they dropped out of every catalogue query while
-- staying published, searchable and in the sitemap. That is not a hypothetical — 91 rows in
-- production are in exactly that state, which is why the previous migration cannot make
-- `category_id` NOT NULL.
--
-- `deleteCategory` (app/admin/actions.ts) already counts referencing products and refuses, so
-- RESTRICT is a backstop rather than a behaviour change: in normal use the admin never gets far
-- enough to hit it. What it adds is a guarantee that does not depend on the application — a bulk
-- delete from the SQL Editor or a future code path now errors instead of quietly stripping rows.
--
-- ON UPDATE CASCADE is kept: category ids are stable, but if one ever changed, following it is
-- right.

alter table public.products
  drop constraint if exists fk_products_category_id;

alter table public.products
  add constraint fk_products_category_id
  foreign key (category_id) references public.categories(id)
  on update cascade
  on delete restrict;

--------------------------------------------------------------------------------
-- Verification — expect `restrict` (letter `r`) for confdeltype:
--
--   select conname, confupdtype, confdeltype
--   from pg_constraint
--   where conrelid = 'public.products'::regclass and contype = 'f';
--------------------------------------------------------------------------------
