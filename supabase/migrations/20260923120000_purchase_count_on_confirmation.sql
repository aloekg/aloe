-- purchase_count counts *confirmed* orders, not placed ones.
--
-- It was incremented in app/checkout/actions.ts the moment an order row landed, and nothing ever
-- took it back. There is no online payment here: a placed order is an intent that a human then
-- verifies by phone, and one in five of them is cancelled. On production at the time of writing
-- that had already broken the shelf it ranks — 10.6% of every counted unit came from cancelled
-- orders, 11 products sat in "Популярные" on cancelled orders alone, and the #2 product on the
-- home page had all 23 of its "purchases" cancelled.
--
-- From here the count follows the status: an order is counted while its status is one of
-- confirmed / processing / delivered, and app/admin/actions.ts applies the difference whenever a
-- status change crosses that boundary — in either direction, because a confirmed order can still
-- be cancelled.
--
-- Two changes below:
--   1. the RPC accepts a negative qty, which is now an ordinary case rather than the attack the
--      previous hardening pass had in mind, and clamps the result at zero;
--   2. a one-off backfill recomputes every counter from the orders that survive the new rule.
--
-- Pre-flight (run against production first, and keep the numbers — the backfill is not reversible
-- without them):
--
--   select status, count(*) from public.orders group by status order by 2 desc;
--   select sum(purchase_count) from public.products;          -- before
--   select count(*) from public.products where purchase_count > 0;

-- 1. Symmetric qty ------------------------------------------------------------------------------
--
-- The bound stays: an unbounded qty from a caller is what the 20260916090100 pass closed, and the
-- reason it exists (purchase_count ranks a public shelf) has not changed. It is merely mirrored.
-- `greatest(0, …)` is the floor: a decrement that arrives twice, or one for an order counted before
-- this migration ran, must not push a counter below zero, where it would sort as "less popular than
-- never bought".
create or replace function public.increment_product_purchase_counts(items jsonb)
  returns void
  language sql
  set search_path = ''
as $function$
  update public.products p
  set purchase_count = greatest(0, p.purchase_count + i.qty)
  from jsonb_to_recordset(items) as i(id int, qty int)
  where p.id = i.id
    and i.qty between -999 and 999
    and i.qty <> 0;
$function$;

revoke all on function public.increment_product_purchase_counts(jsonb) from public, anon, authenticated;
grant execute on function public.increment_product_purchase_counts(jsonb) to service_role;

-- 2. Backfill -----------------------------------------------------------------------------------
--
-- Recomputed from orders.items rather than adjusted, because the old counter has no record of
-- which orders it came from: an order deleted by scripts/purge-test-data.mjs left its units behind,
-- and admin edits to an order's lines never moved it at all. Products with no counted order are
-- reset to 0, which is what drops the phantom entries out of /popular (it filters purchase_count > 0).
with sold as (
  select (i ->> 'id')::int as id,
         sum((i ->> 'quantity')::int)::int as qty
    from public.orders o
    cross join lateral jsonb_array_elements(o.items) as i
   where o.status in ('confirmed', 'processing', 'delivered')
   group by 1
)
update public.products p
   set purchase_count = coalesce(s.qty, 0)
  from public.products target
  left join sold s on s.id = target.id
 where p.id = target.id
   and p.purchase_count is distinct from coalesce(s.qty, 0);

-- Verification ----------------------------------------------------------------------------------
--
--   -- must return no rows: every counter equals the units in its confirmed/processing/delivered orders
--   with sold as (
--     select (i ->> 'id')::int as id, sum((i ->> 'quantity')::int)::int as qty
--       from public.orders o cross join lateral jsonb_array_elements(o.items) as i
--      where o.status in ('confirmed', 'processing', 'delivered')
--      group by 1
--   )
--   select p.id, p.purchase_count, coalesce(s.qty, 0) as expected
--     from public.products p left join sold s on s.id = p.id
--    where p.purchase_count is distinct from coalesce(s.qty, 0);
--
--   -- must return 0: the clamp holds
--   select count(*) from public.products where purchase_count < 0;
