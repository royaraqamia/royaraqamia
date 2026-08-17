-- ============================================================
-- Performance: serving indexes for the admin certificates list
-- and the BlogPress author dashboard.
--
-- Verified against the remote project (2026-08-17): neither index
-- exists today, and both queries currently fall back to a seq scan
-- + in-memory sort because the only indexes on these columns are
-- FKs/PKs that do not cover the ORDER BY clause.
--
-- 1) idx_certificates_created_at
--    backend/repositories/certificates/index.ts `list()` pages the
--    admin grid with:
--      .select('*', { count: 'exact' })
--      .order('created_at', { ascending: false })
--      .range(from, to)
--    With an unbounded future dataset (every issued certificate),
--    the exact-count + ORDER BY forces a seq scan and quicksort on
--    every page turn. A (created_at desc) btree serves both the
--    order and the range directly (and keeps the index order match
--    for the count as the planner scans the index).
--
-- 2) idx_posts_author_sort
--    backend/repositories/blogpress/posts.ts `listPostsByAuthor()`
--    (BlogPress dashboard + calendar) runs:
--      .eq('author_id', <uid>)
--      .order('featured', { ascending: false })
--      .order('updated_at', { ascending: false })
--    idx_posts_author_id (single column) covers the filter but the
--    sort is done in-memory per dashboard render. A composite with
--    the exact sort directions lets Postgres return rows already
--    ordered. Leading author_id also covers the plain author_id
--    filter used elsewhere, so this is a strict superset of the
--    existing index for read paths.
--
-- Additive and idempotent; no RLS / access semantics change.
-- ============================================================
create index if not exists idx_certificates_created_at
  on public.certificates (created_at desc);

create index if not exists idx_posts_author_sort
  on public.posts (author_id, featured desc, updated_at desc);
