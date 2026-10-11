-- ============================================================
-- Move is_admin() out of the exposed API schema
--
-- The security advisor flags `public.is_admin()` because PostgREST exposes the
-- public schema, so a signed-in user could call it at `/rest/v1/rpc/is_admin`.
-- It only ever returns the caller's own flag, so the exposure is a surface, not
-- a leak — but it is still API surface nothing needs.
--
-- It cannot become SECURITY INVOKER (it must read `public.app_settings`, which
-- authenticated cannot read) and it cannot be revoked from `authenticated` (the
-- three certificate policies call it as the invoker). The remaining lever is to
-- move it out of the exposed schema: `private` is not in PostgREST's exposed
-- schemas, so the `/rpc` route disappears while the policies keep working.
--
-- Ordering: repoint the policies first, then drop the public function (drop
-- would fail while a policy depends on it). Grants are re-created to match the
-- current ACL (authenticated + service_role, never anon/public).
--
-- Rollback: recreate public.is_admin() with the 20260917075359 body, repoint the
-- three policies back to public.is_admin(), then drop private.is_admin().
-- ============================================================

create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $function$
  select exists (
    select 1
    from public.app_settings s
    cross join unnest(s.admin_emails) as allowed
    where s.id = true
      and auth.jwt()->>'email' is not null
      and lower(allowed) = lower(auth.jwt()->>'email')
  )
$function$;

revoke all on function private.is_admin() from public;
revoke all on function private.is_admin() from anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_admin() to service_role;

-- Repoint the three certificate write policies at the relocated helper.
drop policy if exists "Admins can insert certificates" on public.certificates;
drop policy if exists "Admins can update certificates" on public.certificates;
drop policy if exists "Admins can delete certificates" on public.certificates;

create policy "Admins can insert certificates" on public.certificates
  for insert to authenticated
  with check (private.is_admin());

create policy "Admins can update certificates" on public.certificates
  for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Admins can delete certificates" on public.certificates
  for delete to authenticated
  using (private.is_admin());

-- No dependents remain once the policies point at private.is_admin().
drop function public.is_admin();
