-- ============================================================
-- Make public.is_admin() depend only on verified identity
--
-- Before:
--   coalesce((select u.is_admin from public.users u where u.id = auth.uid()), false)
--   or (auth.jwt()->>'email') in (select unnest(admin_emails) from public.app_settings where id = true)
--
-- The first branch read a column of a row the caller owned. The client write path is
-- closed (20260917074407_lock_down_public_users_writes), but the value stayed derived
-- state that can be stale: a flag left true by a removal made while the column was
-- writable, or by the sync never running, still satisfied that check. Nothing that
-- authorizes should come from data the subject can influence or that can drift.
--
-- After:
--   * identity comes from the verified JWT (auth.jwt()->>'email'), which a client
--     cannot forge;
--   * the allowlist comes from public.app_settings.admin_emails, which is
--     write-protected (postgres and service_role only).
--
-- Intended behaviour changes:
--   * A user whose auth email changes loses DB-level admin until ADMIN_EMAILS is
--     updated to match it. Previously a stale users.is_admin kept it granted.
--   * The comparison is case-insensitive, matching recompute_admin_flags. The old
--     is_admin() and sync_admin_flag() compared case-sensitively, so a mixed-case
--     entry in app_settings behaved differently in each of the three places.
--   * Anonymous callers get false, never null.
--
-- SECURITY DEFINER stays: the function must read app_settings, which authenticated and
-- anon cannot read directly. auth.jwt() reads a session setting, so it still resolves
-- the caller's identity under definer rights.
--
-- users.is_admin is left alone and is still maintained by sync_admin_flag() and
-- recompute_admin_flags(). It is now non-authoritative: display and notification
-- targeting only. Dropping it is a separate change.
--
-- Verified after applying:
--   * proceeding count check before the swap: currently_flagged=1, would_be_flagged=1,
--     authorisation_changes=0, so it was behaviour-preserving on the day;
--   * function shape: SECURITY DEFINER, STABLE, search_path=public;
--   * execute grants unchanged (authenticated and service_role yes, anon no);
--   * the three certificates policies still resolve is_admin();
--   * direct calls with a simulated JWT claim: no claim -> false, allowlisted email ->
--     true, stranger email -> false.
-- ============================================================

create or replace function public.is_admin()
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

-- Preserve the existing grant shape: callable by authenticated only.
revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;
