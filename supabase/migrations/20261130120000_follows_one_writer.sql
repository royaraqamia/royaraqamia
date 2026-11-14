-- ============================================================
-- The follow graph is written by the service, not the browser (#1379)
--
-- `public.follows` is written by `public.follow_edge` and by nothing else. The
-- function is where a follow's rules live: the follower is the one handed to
-- it, the target has to be a member the directory lists (verified, not hidden),
-- a block in either direction forbids the edge, and the pair is written once.
-- The service decides the one rule Postgres cannot see - the 30 writes a minute
-- budget, which lives in Upstash - and never writes the table itself.
--
-- The table also carried `INSERT`, `UPDATE`, `DELETE` and `TRUNCATE` for
-- `authenticated`, and `anon` held the whole ACL the platform's default
-- privileges used to hand out. With them, a signed-in client could POST or
-- DELETE straight to `/rest/v1/follows` with its own JWT: the policies only
-- check that `follower_id` is the caller, so the directory check, the block
-- check and the rate limit were all bypassed. The same class of gap #886 closed
-- for `chat_reports`.
--
-- SELECT stays for `authenticated`: `public.following_feed` is
-- `security_invoker`, so the caller's own read policy is what decides the feed's
-- rows. `anon` never read this table - the view is granted to `authenticated`
-- alone and a guest has no follows - so its grant goes with the rest.
--
-- The insert/delete policies stay as defence in depth: they still refuse an
-- impersonated `follower_id` if a grant is ever restored, but the grant is the
-- gate. The comments below say so beside each policy.
--
-- `public.follow_edge` and `private.sever_follows_on_block` are security
-- definer and run as the table's owner, which no grant to `authenticated`
-- reaches, so the one writer and the block-severing trigger keep working.
--
-- Rollback:
--   grant all on public.follows to anon, authenticated;
-- ============================================================

revoke all on public.follows from anon, authenticated;
grant select on public.follows to authenticated;

comment on policy "Members follow as themselves" on public.follows is
  'Defence in depth only (#1379): authenticated holds no INSERT on this table, so public.follow_edge is the one writer.';

comment on policy "Members unfollow as themselves" on public.follows is
  'Defence in depth only (#1379): authenticated holds no DELETE on this table, so public.follow_edge is the one writer.';
