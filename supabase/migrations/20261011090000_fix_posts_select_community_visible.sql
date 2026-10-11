-- posts RLS: a hidden Community Post must not be readable by the public.
--
-- The select policy on public.posts was written against the old blog_visible
-- column (20260809065315_perf_indexes_and_rls_initplan.sql:87-94) and was never
-- updated when the column was renamed to community_visible
-- (20261002224417_rename_blog_to_community.sql). Its public branch therefore
-- reads `status = 'published'` alone, so anon (which holds SELECT on posts, and
-- the publishable key is public) could bypass the app and read hidden posts
-- directly through PostgREST, e.g.
--   GET /rest/v1/posts?select=id,slug,content&status=eq.published&community_visible=eq.false
-- The category/tag join policies already require community_visible = true; this
-- brings the posts policy in line with them.
--
-- Idempotent: the policy is dropped first, so a re-run is a no-op.
--
-- Rollback (reintroduces the leak - for local use only):
--   drop policy if exists posts_select_own_or_published on public.posts;
--   create policy "posts_select_own_or_published"
--     on public.posts for select to public
--     using ((select auth.uid()) = author_id or status = 'published');

drop policy if exists posts_select_own_or_published on public.posts;
create policy "posts_select_own_or_published"
  on public.posts
  for select
  to public
  using (
    (select auth.uid()) = author_id
    or (status = 'published' and community_visible = true)
  );
