-- Daily hygiene for the MCP OAuth authorization-code store, beside
-- `sweep_expired_mcp_oauth_tokens` (20260919180145) for the token store.
--
-- Every consent inserts one row here, carrying the encrypted bridge session the
-- granted client will use, and nothing ever deleted it: an un-exchanged code, or
-- one exchanged by a user who never disconnects, stayed until the next
-- `deleteUserAuthCodes`. The token sweeper fixed that unbounded growth for
-- tokens; codes had the same problem and the same reason to fix it — a dump plus
-- `MCP_TOKEN_ENCRYPTION_KEY` would decrypt historical bridge sessions.
--
-- A code is dead as soon as it is claimed: the exchange copied its ciphertext
-- into the issued token pair, and `markAuthCodeUsed` shreds the row's copy in the
-- same update. Expiry makes it dead too. Both are safe to drop immediately —
-- `idx_mcp_oauth_auth_codes_expires` shows the cleanup was intended.
--
-- Mirrors the token sweeper: a SECURITY DEFINER function (the executor bypasses
-- RLS, which is service_role-only on these tables) revoke-locked from the public
-- roles, scheduled via pg_cron.

create extension if not exists pg_cron;

create or replace function public.sweep_expired_mcp_oauth_auth_codes()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  delete from public.mcp_oauth_auth_codes
  where used_at is not null
     or expires_at < now();
end;
$fn$;

revoke execute on function public.sweep_expired_mcp_oauth_auth_codes()
  from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'mcp-oauth-auth-codes-sweep') then
    perform cron.schedule(
      'mcp-oauth-auth-codes-sweep',
      '45 3 * * *',
      $$select public.sweep_expired_mcp_oauth_auth_codes()$$
    );
  end if;
end;
$do$;
