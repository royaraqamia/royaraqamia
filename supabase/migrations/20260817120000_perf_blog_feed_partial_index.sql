-- ============================================================
-- Performance: partial index for the public blog feed.
--
-- Justification (verified against the remote project 2026-08-17):
-- the read path in backend/repositories/blogpress/posts.ts serves the
-- blog index and related-posts cards with:
--
--   .or(status.eq.published,and(status.eq.scheduled,publish_at.lte.now))
--   .eq('blog_visible', true)
--   .order('published_at', { ascending: false, nullsFirst: true })
--
-- The existing idx_posts_publish_at covers the SCHEDULED date column
-- (publish_at); nothing covers ORDER BY published_at for the dominant
-- "published" branch, so as the blog grows the feed falls back to a
-- seq scan + in-memory sort. This partial btree matches the dominant
-- branch exactly. A DESC btree orders NULLS FIRST by default, which
-- matches the `nullsFirst: true` client hint, so the feed is served as
-- an index scan with no extra sort. Scheduled rows keep using
-- idx_posts_publish_at via a BitmapOr.
--
-- Additive and idempotent; no RLS / access semantics change.
-- ============================================================
create index if not exists idx_posts_published_feed
  on public.posts (published_at desc)
  where status = 'published' and blog_visible;