-- One review per product per customer, not per order.
--
-- The table shipped with `unique (order_id, product_id)`, on the reasoning that a second purchase is
-- a second experience and deserves a second opinion. That is wrong for this shop specifically: it
-- sells consumables — washing powder, napkins, nappies — where **buying the same thing again is the
-- normal case, not the exception**. Under the old rule one customer could accumulate a review per
-- order on the same product: their name and avatar repeated down the product page, and their
-- opinion weighted two, five, ten times in an average built from a handful of reviews. It also
-- reads to Google exactly like the review manipulation its policy is about.
--
-- The right shape is one review per customer per product, editable — which is what the profile's
-- "Отзывы" tab is for. `order_id` stays on the row: it is the proof of purchase that earned the
-- review and the context the moderator sees, it is simply no longer part of what must be unique.

-- Deduplicate before the constraint can exist. The newest wins: a customer who wrote twice meant
-- the second one, and the edit path now makes that the only way to say something new.
delete from public.reviews r
 using public.reviews newer
 where r.user_id = newer.user_id
   and r.product_id = newer.product_id
   and (newer.created_at, newer.id) > (r.created_at, r.id);

alter table public.reviews drop constraint if exists reviews_order_id_product_id_key;

alter table public.reviews
  add constraint reviews_user_id_product_id_key unique (user_id, product_id);

-- Verification ----------------------------------------------------------------------------------
--
--   -- must return no rows
--   select user_id, product_id, count(*) from public.reviews group by 1, 2 having count(*) > 1;
--
--   -- the constraint that remains
--   select conname from pg_constraint
--    where conrelid = 'public.reviews'::regclass and contype = 'u';
