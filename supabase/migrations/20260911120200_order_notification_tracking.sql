-- Makes a lost order notification visible.
--
-- The admin learns about orders by email. When SMTP broke on 2026-08-17 the only trace was a
-- console.error in a platform log nobody reads, and there was no way to answer "which orders were
-- never emailed?" — the breakage surfaced only because someone checked by hand.
--
-- Additive and nullable: existing rows get NULL, which reads as "never confirmed sent". That is
-- accurate for orders placed before this column existed, and the admin UI labels them as unknown
-- rather than failed.
--
-- Applied to production by hand through the Supabase SQL Editor on 2026-08-17, before the
-- schema was under migration control. Kept here so a fresh database reaches the same state:
-- every statement is idempotent, so `supabase db push` against production is a no-op.

alter table public.orders
  add column if not exists notified_at timestamptz;

comment on column public.orders.notified_at is
  'When the admin notification email was confirmed sent. NULL means never sent, or predates tracking.';

-- The admin list filters on it to surface un-notified orders; partial, since the interesting rows
-- are the NULL ones and they stay a small minority.
create index if not exists orders_unnotified_idx
  on public.orders (created_at desc)
  where notified_at is null;

-- Writes go through the service role only; nothing changes for anon/authenticated, whose write
-- grants on orders were revoked in 002.

--------------------------------------------------------------------------------
-- Verification
--------------------------------------------------------------------------------
-- select count(*) filter (where notified_at is null) as unnotified,
--        count(*) filter (where notified_at is not null) as notified
-- from public.orders;

--------------------------------------------------------------------------------
-- Optional backfill.
--
-- Every pre-existing row is NULL, and the admin list flags each one as "отправка не подтверждена".
-- That is literally true but noisy, because some of those orders *were* emailed — tracking simply
-- did not exist yet.
--
-- Orders placed before 2026-08-17 08:57 UTC predate the SMTP breakage, so their notifications did
-- go out. Marking them keeps the flag meaningful for the ones that actually need attention.
-- Deliberately left commented: it asserts something about the past that only the shop owner can
-- confirm from their inbox.
--------------------------------------------------------------------------------
-- update public.orders
--    set notified_at = created_at
--  where notified_at is null
--    and created_at < '2026-08-17T08:57:00Z';
