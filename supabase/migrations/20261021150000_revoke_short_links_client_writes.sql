-- ============================================================
-- Close the direct anonymous write path on short_links (#460)
--
-- 20261015103957_narrow_short_links_public_read.sql closed the read hole and
-- stopped there: `public.short_links` still carried table-level INSERT, UPDATE
-- and DELETE for `anon` and `authenticated` (Supabase's default table
-- privileges in the public schema, so no migration ever spelled them out), and
-- the three write policies that predate supabase/migrations were left in place.
--
-- The insert policy was permissive to `public` and its check was
--
--   ((select auth.uid()) = user_id)
--   or ((select auth.uid()) is null and user_id is null)
--
-- so an anonymous caller holding the publishable key - which ships in the
-- browser - satisfied it with `user_id = null`. POST /rest/v1/short_links with
-- `Prefer: return=minimal` committed the row without any SELECT, and that is
-- the one path that skips everything the public shortening endpoint enforces:
-- the per-IP Upstash rate limit, `SecurityValidator.validateUrl` and the
-- reserved-code check in backend/services/linksnap/shorten-url.ts. The result
-- is unbounded anonymous short links, phishing included, under our own domain.
--
-- No app path needs those grants: every write goes through the service role
-- (`backend/config/linksnap.ts` -> `getAdminSupabase()`), which bypasses RLS
-- and keeps the password hash and owner server-side. `upsert_short_link`
-- (20261017095932) is SECURITY INVOKER and so inherited PostgreSQL's default
-- EXECUTE for PUBLIC - it is revoked here too, or the same bypass would come
-- back in through the RPC. `short_links_read` (owner-scoped, `authenticated`)
-- is left exactly as it is.
--
-- `scripts/check-migration-safety.mjs` refuses this file for unattended apply:
-- a dropped policy the same file does not recreate is a review item, and that
-- is the intent here. It has to be applied by hand once approved:
--   supabase link --project-ref <ref> && supabase db push
--
-- Rollback (restores the pre-#460 exposure - read the issue before running):
--   grant insert, update, delete on public.short_links to anon, authenticated;
--   grant execute on function public.upsert_short_link(text, text, uuid,
--     timestamptz, timestamptz, boolean, timestamptz, text, uuid, timestamptz)
--     to public;
-- and recreate the three policies from the project's own definitions: they
-- predate this repository, so `select * from pg_policies where tablename =
-- 'short_links'` on the linked project is the only copy of their exact USING
-- and WITH CHECK clauses. `short_links_insert` is the one that accepted a null
-- `user_id`; the update and delete policies were owner-scoped to
-- `authenticated`.
-- ============================================================

revoke insert, update, delete on public.short_links from anon, authenticated;

drop policy if exists short_links_insert on public.short_links;
drop policy if exists short_links_update on public.short_links;
drop policy if exists short_links_delete on public.short_links;

revoke execute on function public.upsert_short_link(
  text,
  text,
  uuid,
  timestamptz,
  timestamptz,
  boolean,
  timestamptz,
  text,
  uuid,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.upsert_short_link(
  text,
  text,
  uuid,
  timestamptz,
  timestamptz,
  boolean,
  timestamptz,
  text,
  uuid,
  timestamptz
) to service_role;
