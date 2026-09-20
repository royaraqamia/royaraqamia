-- Daily hygiene for the MCP OAuth token store.
--
-- Every token issuance inserts 2 rows (access + refresh) and every refresh
-- rotation adds 2 more while only setting `revoked_at` on the superseded pair.
-- Nothing ever deletes, so `mcp_oauth_tokens` grows monotonically: revoked or
-- expired rows would otherwise accumulate forever and stretch every later
-- revocation fan-out and lookup. Access tokens live ~10 minutes; a revoked or
-- expired row is dead on arrival and safe to drop immediately.
--
-- Mirrors the existing `sweep_stale_push_subscriptions` pattern: a
-- SECURITY DEFINER function (executor bypasses RLS, which is service_role-only
-- on these tables) revoke-locked from public roles, scheduled via pg_cron.

create extension if not exists pg_cron;

create or replace function public.sweep_expired_mcp_oauth_tokens()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  delete from public.mcp_oauth_tokens
  where revoked_at is not null
     or expires_at < now();
end;
$fn$;

revoke execute on function public.sweep_expired_mcp_oauth_tokens()
  from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'mcp-oauth-tokens-sweep') then
    perform cron.schedule(
      'mcp-oauth-tokens-sweep',
      '30 3 * * *',
      $$select public.sweep_expired_mcp_oauth_tokens()$$
    );
  end if;
end;
$do$;