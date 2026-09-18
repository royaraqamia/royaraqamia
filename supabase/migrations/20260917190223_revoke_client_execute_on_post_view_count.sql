-- ============================================================
-- Revoke client EXECUTE on the blog view counter
--
-- public.increment_post_view_count(p_post_id uuid) is a SECURITY DEFINER
-- function that was callable by anon and authenticated via /rest/v1/rpc,
-- which the security advisor flagged as an unauthenticated write endpoint
-- (anyone holding the public anon key could inflate view counts directly,
-- bypassing application rate limits).
--
-- Blog views are now counted through the rate-limited server route
-- app/api/blog/[slug]/view, which resolves the published post and calls this
-- RPC with the service role. Client EXECUTE is no longer needed: service_role
-- keeps its explicit grant, so the route still works.
-- ============================================================

revoke execute on function public.increment_post_view_count(uuid) from public, anon, authenticated;