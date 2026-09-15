-- The three public buckets the admin uploads into.
--
-- Until now they existed only in the dashboard, which made "the schema lives in supabase/migrations"
-- half true: `db push` against an empty project produced every table and no storage at all, and the
-- first upload failed with "Bucket not found" — with nothing in the repo to say what was missing.
-- Staging is the first environment to hit that; it will not be the last.
--
-- `on conflict do nothing` makes this a strict no-op against production, where all three already
-- exist. It deliberately does NOT reconcile settings: if production's limits are ever changed by
-- hand, this file goes stale silently rather than quietly reverting them under someone. The values
-- below were read off production on 2026-09-15 and must be kept in step by hand.
--
-- The limits are not decoration, and they are not the same as the ones in app/admin/actions.ts:
--
--   product-images  2 MB   Product photos are re-encoded by sharp before upload, so the action
--                          accepts a 15 MB phone original (MAX_IMAGE_BYTES) while the bucket only
--                          ever sees the ≤1200px q82 WebP and its ≤500px thumb. 2 MB is a ceiling
--                          on the *output*, which those comfortably clear.
--   banners         3 MB   Same re-encoding, but desktop banners run to ≤1600px q82 — hence the
--                          wider allowance.
--   categories      2 MB   The exception: uploadImage() stores category images AS UPLOADED, with no
--                          sharp pass. Here the bucket limit is the only limit, and it applies to
--                          the file the admin picked. A large phone photo is rejected at the bucket.
--
-- svg+xml is allowed on banners and categories because those were hand-made artwork; product photos
-- are camera images and the narrower list is correct for them.
--
-- public = true: every consumer reads these over plain https out of products.image_url /
-- banners.image_url / categories.image_url. Nothing signs a URL.
--
-- No policies on storage.objects: writes go through the service-role key, which bypasses RLS, and
-- a public bucket needs none to be read.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('banners',        'banners',        true, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']),
  ('categories',     'categories',     true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'])
on conflict (id) do nothing;

--------------------------------------------------------------------------------
-- Verify (expect three rows, all public, matching the comment above):
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;
--
-- If `db push` reports "permission denied for table buckets", run the insert from the dashboard's
-- SQL Editor and then record it as applied:
--   npx supabase migration repair --status applied 20260915090000
--------------------------------------------------------------------------------
