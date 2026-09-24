-- rate_limits stops growing without bound.
--
-- One row per (bucket, ip) pair, written on the first hit and updated ever after — and never
-- deleted. Every distinct visitor IP that ever touched checkout, a review form or the brand
-- infinite-scroll leaves a row behind, which is a slow leak into a table that is read on every
-- public write. The counters mean nothing once their window has passed, so the function that
-- maintains them can also sweep them: on roughly one call in a hundred it deletes rows whose window
-- started more than a day ago. Amortised, that costs nothing a visitor can feel, and it needs no
-- cron extension the plan may not have.
--
-- Same signature, same grants, same semantics for the caller; only the sweep is new.
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

  -- Amortised garbage collection. A day is far longer than any window rateLimit() asks for
  -- (lib/rate-limit.ts uses seconds to minutes), so nothing still counting is ever swept.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.rate_limit_hit(text, text, integer, interval) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, interval) to service_role;

-- Verification -----------------------------------------------------------------------------------
--
--   insert into public.rate_limits values ('probe', 'old', now() - interval '2 days', 1);
--   select public.rate_limit_hit('probe', 'k', 5, interval '1 minute') from generate_series(1, 500);
--   select count(*) from public.rate_limits where key = 'old';   -- 0, with overwhelming probability
--   delete from public.rate_limits where bucket = 'probe';
