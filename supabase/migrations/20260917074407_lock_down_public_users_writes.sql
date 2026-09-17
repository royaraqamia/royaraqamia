-- ============================================================
-- Lock down client writes to public.users
--
-- public.users carried table-level INSERT/UPDATE/DELETE grants for both `anon`
-- and `authenticated`, and its only UPDATE policy is
-- `using (auth.uid() = id)` with no WITH CHECK. Postgres defaults a missing
-- WITH CHECK to the USING expression, so that policy pins the row owner and
-- nothing else: a signed-in user could write any column of their own row,
-- including `is_admin`. The `BEFORE INSERT OR UPDATE OF email` trigger does not
-- defend that, because an update which does not touch `email` never fires it,
-- and `email` itself is not unique, so it can be pointed at an allowlisted
-- address to flip the flag on purpose.
--
-- `users.is_admin` is read by public.is_admin(), which three certificates
-- policies depend on, so a user-writable column there is an authorization input
-- rather than a display field. This migration removes the write path and leaves
-- only the columns the app maintains from a user session.
--
-- Safe to apply:
--   * signup and login reach public.users through the service role
--     (backend/config/auth.ts), so auth-time writes are unaffected;
--   * handle_new_user() is SECURITY DEFINER and inserts only
--     (id, email, name, avatar_url, bio);
--   * the profile editor updates exactly name, avatar_url and bio
--     (backend/repositories/users/user-profile-repository.ts).
--
-- Note: `revoke update (is_admin)` alone would not help — the grant is
-- table-level, and a column-level revoke does not override a table grant, so
-- the table privilege is dropped and the profile columns re-granted instead.
--
-- This does not touch public.is_admin() or the column itself: removing the
-- database's reliance on `users.is_admin` for authorization is a separate
-- change, tracked with the Admin allowlist ADR.
-- ============================================================

revoke all on public.users from public;
revoke all on public.users from anon;

revoke insert, update, delete, truncate, references, trigger
  on public.users from authenticated;

-- Reads stay (row visibility is already constrained by the own-profile policy);
-- writes shrink to the columns the profile editor owns.
grant select on public.users to authenticated;
grant update (name, avatar_url, bio) on public.users to authenticated;
