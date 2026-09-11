-- Deleting a customer account must not erase the sale.
--
-- `orders_user_id_fkey` is ON DELETE CASCADE, so removing an account deletes every order it ever
-- placed — silently, from the dashboard's Users page as much as from code. That is tolerable while
-- the only accounts are test ones, and wrong the moment the shop is live: an order is the shop's
-- record of a transaction, and `backups/backup-db.mjs` runs on demand, not on delete.
--
-- SET NULL is exactly right here because an order does not depend on the account for anything it
-- displays: `customer_name`, `customer_phone`, `customer_address` and `items` are all frozen into
-- the row at checkout — that is what makes guest checkout possible in the first place (user_id is
-- nullable by design). A deleted account's orders simply become guest orders: they stay in
-- /admin/orders and in the totals, and they drop out of that person's /profile history, which no
-- longer exists anyway.
--
-- The account's cart and favourites keep cascading — those are live state, not records.

alter table public.orders
  drop constraint if exists orders_user_id_fkey;

alter table public.orders
  add constraint orders_user_id_fkey
  foreign key (user_id) references auth.users(id)
  on delete set null;

--------------------------------------------------------------------------------
-- Verification — expect confdeltype 'n' (set null) rather than 'c' (cascade):
--
--   select conname, confdeltype
--   from pg_constraint
--   where conrelid = 'public.orders'::regclass and contype = 'f';
--------------------------------------------------------------------------------
