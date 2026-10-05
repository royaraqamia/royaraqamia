-- ============================================================
-- Drop posts.title — posts are title-less (social-media model)
--
-- Community and BlogPress now treat a post as body-first: the
-- human-readable label is derived from `content` (see
-- shared/reading-time.ts `postExcerpt`), and SEO keeps its own
-- `meta_title` / `meta_desc` columns.
--
-- This is a DESTRUCTIVE migration (drops a column) and was approved
-- explicitly. Existing titles are discarded; nothing reads them
-- afterwards (repository, contracts, DB types, BlogPress editor,
-- Community feed, and MCP tools were all updated in the same change).
--
-- Search previously matched `title` + `meta_desc` via
-- idx_posts_title_meta_trgm. With the title gone we search the body and
-- the meta description instead, so the trigram index is rebuilt over
-- `content` + `meta_desc`.
--
-- Idempotent: the index drop and column drop are guarded.
-- ============================================================

-- 1. Retire the title-backed search index ---------------------------
drop index if exists public.idx_posts_title_meta_trgm;

-- 2. Search now spans the body and the meta description -------------
create index if not exists idx_posts_meta_desc_trgm
  on public.posts using gin (meta_desc gin_trgm_ops);

create index if not exists idx_posts_content_trgm
  on public.posts using gin (content gin_trgm_ops);

-- 3. Drop the column ------------------------------------------------
alter table if exists public.posts drop column if exists title;
