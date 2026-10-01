-- A customer reads their own reviews, whatever state they are in.
--
-- The public policy shows approved rows only, which is right for the storefront and wrong for the
-- author: someone who has just written a review sees nothing at all until a moderator gets to it,
-- and a rejected one becomes invisible rather than fixable. The profile's "Отзывы" tab needs both.
--
-- Widened rather than added as a second policy: PostgreSQL ORs permissive policies together, so two
-- would work, but then "what may anon see" is answered in two places. One predicate, one answer.
--
-- `auth.uid()` is null for anon, and `user_id` is NOT NULL, so the second branch simply never
-- matches a signed-out reader.
drop policy if exists "approved reviews are public" on public.reviews;

create policy "approved reviews are public, own reviews always"
  on public.reviews for select
  to anon, authenticated
  using (status = 'approved' or user_id = (select auth.uid()));

-- Verification -----------------------------------------------------------------------------------
--
--   -- anon sees approved only
--   set role anon; select status, count(*) from public.reviews group by 1; reset role;
--
--   -- exactly one select policy on the table
--   select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'reviews';
