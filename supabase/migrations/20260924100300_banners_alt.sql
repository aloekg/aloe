-- banners.alt — what a banner says, for whoever cannot see it.
--
-- The carousel rendered every banner as `alt="Баннер N"`, which tells a screen reader user that
-- there is a picture and nothing about the offer on it or where its link goes — WCAG 2.4.4, level
-- A, on the first thing the home page shows. There was nowhere to store a better text: the row has
-- an image and a link and nothing else. This is that column, filled in by the admin on
-- /admin/banners beside the link; the carousel falls back to the old label where it is empty, so
-- nothing changes for a banner nobody has described yet.
--
-- Bounded at 200: an alt is a sentence, not a description, and an unbounded text column on a
-- publicly readable table is a place to hide things.
alter table public.banners
  add column if not exists alt text check (alt is null or char_length(alt) <= 200);

-- Verification -----------------------------------------------------------------------------------
--
--   select id, type, link, alt from public.banners order by type, sort_order;
--   -- anon still reads it: the existing select policy covers all columns of the row
--   set role anon; select alt from public.banners where active limit 1; reset role;
