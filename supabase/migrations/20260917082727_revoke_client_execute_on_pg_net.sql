-- ============================================================
-- Revoke client EXECUTE on pg_net's HTTP functions
--
-- The security advisor flags pg_net as installed in the public schema. Relocating the
-- extension is deliberately not done here: the extension is registered in `public`, but
-- its functions already live in the `net` schema, which PostgREST does not expose, and
-- both habit-reminder functions call net.http_post by name, so moving the extension
-- risks breaking production webhooks for no security gain.
--
-- What is worth closing is the exposure itself. PostgreSQL grants EXECUTE on new
-- functions to PUBLIC by default, so anon and authenticated could reach net.http_post,
-- net.http_get and net.http_delete. Nothing needs that: the only callers are
-- public.send_daily_habit_reminders() and the habit recovery nudge, both SECURITY
-- DEFINER functions owned by postgres and invoked from pg_cron, so they run with the
-- owner's privileges and do not depend on the caller holding EXECUTE.
--
-- Verified after applying: anon and authenticated can no longer execute the three
-- functions.
-- ============================================================

revoke execute on function net.http_post(text, jsonb, jsonb, jsonb, integer) from public, anon, authenticated;
revoke execute on function net.http_get(text, jsonb, jsonb, integer) from public, anon, authenticated;
revoke execute on function net.http_delete(text, jsonb, jsonb, integer, jsonb) from public, anon, authenticated;
