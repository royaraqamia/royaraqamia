-- ============================================================
-- Keyset (cursor) pagination for the public community feed.
--
-- The feed now walks `published_at DESC NULLS FIRST, id DESC` with an opaque
-- cursor instead of OFFSET, so deep pages stay stable when new posts arrive.
-- We extend the partial btree to include the `id` tiebreaker, letting the whole
-- ORDER BY be served by one index scan.
--
-- A DESC btree orders NULLS FIRST by default, matching the repository's
-- `nullsFirst: true` hint, so the NULL bucket (scheduled-but-due rows) keeps
-- sorting first. Those rows are outside the partial predicate
-- (status = 'published') and keep falling back to idx_posts_publish_at.
--
-- Additive and idempotent; no RLS / access semantics change. The previous
-- single-column index of the same name is superseded by this composite one.
-- ============================================================
drop index if exists public.idx_posts_published_feed;

create index if not exists idx_posts_published_feed
  on public.posts (published_at desc, id desc)
  where status = 'published' and community_visible;
