-- Future tables and sequences are born with no grants to anon or authenticated.
--
-- The baseline dump (20260817053308_remote_schema.sql) carries Supabase's project defaults:
--   alter default privileges for role postgres in schema public grant select, insert, update, delete
--   on tables to anon, authenticated;
-- and the same for sequences. 20260916090100 revoked that for *routines* — the case with no RLS
-- backstop — and left tables alone, because `rls_auto_enable` switches RLS on for every new table
-- and RLS with no policy denies everything regardless of the grant.
--
-- That reasoning holds until the first policy is written. The moment a future table gets a
-- `for select using (true)` so the storefront can read it, the default grant hands insert, update
-- and delete along with it, and nothing in the migration that added the policy would say so. Every
-- table created since the baseline has had to revoke those grants by hand (rate_limits, reviews);
-- this makes the safe state the default, so a migration that forgets is a table nobody can read
-- rather than one anybody can write.
--
-- Existing tables are not touched: their grants are set explicitly and audited by
-- supabase/sql/audit-rls.sql §5.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- `rls_auto_enable()` is an event-trigger function: it cannot be called directly, so the execute
-- grant it inherited from the old routine default is inert. Revoked for the same reason a locked
-- door is still locked when nothing is behind it — the audit script lists public grantees, and a
-- list that has to carry an exception is a list that is read less carefully.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- Verification -----------------------------------------------------------------------------------
--
--   -- defaults for postgres in public: tables and sequences must show no anon/authenticated entry
--   select defaclobjtype, defaclacl
--     from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
--    where n.nspname = 'public';
--
--   -- smoke test (in a transaction, then roll back)
--   begin;
--     create table public._priv_probe (id int);
--     select grantee, privilege_type from information_schema.role_table_grants
--      where table_name = '_priv_probe' and grantee in ('anon', 'authenticated');   -- no rows
--   rollback;
