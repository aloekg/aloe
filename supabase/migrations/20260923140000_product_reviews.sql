-- Product reviews, rated 1..5 and moderated before they are shown.
--
-- Two things shape this table more than the feature itself.
--
-- **Who may write one.** The only anti-spam that costs nothing is "you may review what you actually
-- received", and here that is hard to ask: 24 of 25 delivered orders on production were placed by a
-- guest, so `orders.user_id` is null and a later sign-up has nothing to match against. Matching on
-- the phone number instead would mean anyone who knows a number can claim that person's orders —
-- and their addresses with them, since checkout does not verify a phone.
--
-- So the proof of purchase is a token on the order. `orders.review_token` travels to the customer
-- over the one channel the shop already uses — the WhatsApp message the admin sends by hand when an
-- order is delivered (lib/whatsapp.ts) — which makes delivery to that number the verification.
-- Posting still requires signing in, and signing in with a valid token also claims the guest order
-- for the account: the token proves ownership, so app/review/actions.ts can safely set
-- `orders.user_id`. That is the real reason to register — the order history — rather than the
-- review itself.
--
-- **What the storefront reads.** A product card cannot join an aggregate: the catalogue's list
-- queries are cached whole (see "Cache budget" in CODEBASE.md), so the rating lives denormalised on
-- `products` and a trigger keeps it there. Only approved reviews count towards it.

create table if not exists public.reviews (
  id          bigint generated always as identity primary key,
  product_id  bigint  not null references public.products(id) on delete cascade,
  -- The order that earns the right to write this review. `restrict`: deleting an order must not
  -- silently erase the review it justified — scripts/purge-test-data.mjs deletes orders by id, and
  -- a review whose order vanished is still a real thing a real customer wrote.
  order_id    bigint  not null references public.orders(id) on delete restrict,
  user_id     uuid    not null references auth.users(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  body        text    check (body is null or char_length(body) <= 2000),
  status      text    not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  -- One review per product per order. Someone who buys the same product twice may review it twice,
  -- which is honest; someone who buys it once may not review it five times.
  unique (order_id, product_id)
);

create index if not exists reviews_product_approved_idx
  on public.reviews (product_id, created_at desc)
  where status = 'approved';

-- The moderation queue, which is the admin's whole view of this table.
create index if not exists reviews_status_created_idx
  on public.reviews (status, created_at desc);

create index if not exists reviews_user_idx on public.reviews (user_id);

-- Proof of purchase -----------------------------------------------------------------------------
alter table public.orders
  add column if not exists review_token uuid not null default gen_random_uuid();

-- Unique so a lookup by token is an index hit and cannot ever match two orders.
create unique index if not exists orders_review_token_key on public.orders (review_token);

-- Denormalised rating ---------------------------------------------------------------------------
alter table public.products
  add column if not exists rating_sum   integer not null default 0,
  add column if not exists rating_count integer not null default 0;

-- Sum and count rather than an average: an average cannot be updated incrementally without
-- accumulating float drift, and the storefront divides once at render time.
create or replace function public.sync_product_rating()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  target bigint;
begin
  -- A moderator can move a review between products only by deleting it, so old and new product_id
  -- differ solely on delete; recompute both to be safe.
  for target in
    select distinct x from unnest(array[old.product_id, new.product_id]) as x where x is not null
  loop
    update public.products p
       set rating_sum   = coalesce((select sum(r.rating)   from public.reviews r
                                     where r.product_id = target and r.status = 'approved'), 0),
           rating_count = coalesce((select count(*)        from public.reviews r
                                     where r.product_id = target and r.status = 'approved'), 0)
     where p.id = target;
  end loop;
  return null;
end;
$function$;

drop trigger if exists reviews_sync_product_rating on public.reviews;
create trigger reviews_sync_product_rating
  after insert or update or delete on public.reviews
  for each row execute function public.sync_product_rating();

revoke all on function public.sync_product_rating() from public, anon, authenticated;

-- RLS -------------------------------------------------------------------------------------------
--
-- Reads are public but only of approved rows: the storefront renders reviews through the anon
-- client (lib/supabase.ts) inside a cached query, and a pending review must not be visible to
-- anyone but the admin. Every write goes through a server action on the service-role client, which
-- is where the token, the sign-in and the "was it actually in this order" checks live — none of
-- which RLS could express against a jsonb `orders.items`.
alter table public.reviews enable row level security;

drop policy if exists "approved reviews are public" on public.reviews;
create policy "approved reviews are public"
  on public.reviews for select
  to anon, authenticated
  using (status = 'approved');

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;

-- Verification ----------------------------------------------------------------------------------
--
--   -- every order has a token, and they are unique
--   select count(*) filter (where review_token is null) as missing, count(distinct review_token) = count(*) as unique_ok
--     from public.orders;
--
--   -- the denormalised rating agrees with the approved reviews (must return no rows)
--   select p.id, p.rating_sum, p.rating_count
--     from public.products p
--     left join (select product_id, sum(rating) s, count(*) c from public.reviews
--                 where status = 'approved' group by 1) r on r.product_id = p.id
--    where p.rating_sum is distinct from coalesce(r.s, 0)
--       or p.rating_count is distinct from coalesce(r.c, 0);
--
--   -- anon may read approved only
--   set role anon; select status, count(*) from public.reviews group by 1; reset role;
