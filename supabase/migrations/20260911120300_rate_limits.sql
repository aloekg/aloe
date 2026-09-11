-- Rate-limit bookkeeping for public server actions.
--
-- `createOrder` is an unauthenticated POST that, per call, queries products, inserts with the
-- service-role key, runs an RPC, renders a PDF and sends mail. Nothing limited how often it could
-- be called, so a trivial loop could fill the orders table, exhaust the SMTP quota and — worst —
-- inflate purchase_count by up to 999 per request, which is what ranks "Популярные товары". No
-- payment is involved, orders are confirmed by phone.
--
-- Postgres rather than Redis/KV: there is no other store in this project, the volume is tiny, and
-- an atomic upsert is enough. Additive; nothing existing is touched.
--
-- Applied to production by hand through the Supabase SQL Editor on 2026-08-17, before the
-- schema was under migration control. Kept here so a fresh database reaches the same state:
-- every statement is idempotent, so `supabase db push` against production is a no-op.

create table if not exists public.rate_limits (
  bucket      text        not null,
  key         text        not null,
  window_start timestamptz not null default now(),
  hits        integer     not null default 0,
  primary key (bucket, key)
);

comment on table public.rate_limits is
  'Fixed-window counters for public server actions. Written by the service role only.';

-- Lets the sweep below find expired rows without a full scan once this grows.
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

-- RLS on with no policy at all: the table is service-role only, and the service role bypasses RLS.
-- Without this, the anon key could read and write it.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

--------------------------------------------------------------------------------
-- Atomic check-and-increment. Returns true when the call is allowed.
--
-- SECURITY DEFINER with a pinned search_path, granted to service_role only, so the counter cannot
-- be reset by anyone who can reach PostgREST.
--------------------------------------------------------------------------------
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_key    text,
  p_limit  integer,
  p_window interval
) returns boolean
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits (bucket, key, window_start, hits)
  values (p_bucket, p_key, now(), 1)
  on conflict (bucket, key) do update
    set hits = case
                 when public.rate_limits.window_start < now() - p_window then 1
                 else public.rate_limits.hits + 1
               end,
        window_start = case
                 when public.rate_limits.window_start < now() - p_window then now()
                 else public.rate_limits.window_start
               end
  returning hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.rate_limit_hit(text, text, integer, interval) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, interval) to service_role;

--------------------------------------------------------------------------------
-- Verification
--------------------------------------------------------------------------------
-- select public.rate_limit_hit('test', 'k', 2, interval '1 minute');  -- true
-- select public.rate_limit_hit('test', 'k', 2, interval '1 minute');  -- true
-- select public.rate_limit_hit('test', 'k', 2, interval '1 minute');  -- false
-- delete from public.rate_limits where bucket = 'test';
