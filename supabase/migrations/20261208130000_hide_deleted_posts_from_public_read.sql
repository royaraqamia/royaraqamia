-- posts RLS: a deleted Community Post must not be readable by the public.
--
-- A delete is a Tombstone, not a hard delete (ADR-0029): `deletePost` sets
-- `deleted_at` and leaves `status` and `community_visible` exactly as they were
-- (backend/repositories/blogpress/posts.ts:660-676; the bulk delete does the
-- same). The app's reads filter `deleted_at is null`, so the site and the
-- following feed stop drawing the post. The SELECT policy did not, and it is
-- the gate PostgREST answers: its public branch was written a day before the
-- tombstone column existed, so it only asked for `status = 'published' and
-- community_visible = true`, which a tombstoned published post still satisfies.
--
-- `anon` holds SELECT on `posts` and the publishable key is inlined in every
-- page, so anyone could read a post its author deleted, straight from the Data
-- API, e.g.
--   GET /rest/v1/posts?select=id,slug,content&deleted_at=not.is.null
-- This is the same class of hole 20261011090000_fix_posts_select_community_visible
-- closed for the `community_visible` branch; the tombstone arrived in
-- 20261012140354_blogpress_offline_drafts and was never folded in.
--
-- The rule this file records: a Tombstone leaves the public projection at the
-- policy, not only in the repository, because the publishable key reaches
-- PostgREST without the app.
--
-- The author branch stays unconditional on purpose: the row is theirs to read in
-- any state, which is what keeps `deletePost`'s `update(...).select('slug')`
-- answering a row (an UPDATE's RETURNING rows must also pass the SELECT policy),
-- so `revalidate` still fires and the undo token is still returned.
-- `restore_post` is `security definer` and reads the tombstone itself, so undo
-- needs no SELECT on it.
--
-- Idempotent: the policy is dropped first, so a re-run is a no-op.
--
-- Rollback (reintroduces the leak - for local use only):
--   drop policy if exists posts_select_own_or_published on public.posts;
--   create policy "posts_select_own_or_published"
--     on public.posts for select to public
--     using (
--       (select auth.uid()) = author_id
--       or (status = 'published' and community_visible = true)
--     );

drop policy if exists posts_select_own_or_published on public.posts;
create policy "posts_select_own_or_published"
  on public.posts
  for select
  to public
  using (
    (select auth.uid()) = author_id
    or (status = 'published' and community_visible = true and deleted_at is null)
  );
