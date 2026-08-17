-- ============================================================
-- Performance: store a precomputed reading time on posts.
--
-- The public blog feed and related-posts cards previously had to
-- select the full `content` column (multi-hundred-KB rows) just to
-- render a reading-time badge. This adds a small integer column,
-- computed at write time in the repository, so the feed reads a
-- light projection without `content`.
--
-- Additive and idempotent; no RLS / access semantics change.
-- ============================================================
alter table public.posts
  add column if not exists reading_time_minutes integer not null default 0;

-- Backfill existing rows with a deterministic approximation that
-- mirrors shared/reading-time.ts: word count (whitespace-split)
-- divided by 180, rounded up. A light regex pass strips the common
-- markdown syntax before counting so the backfill tracks the
-- server-side estimate closely enough for display purposes.
update public.posts
set reading_time_minutes = greatest(
    1,
    ceil(
      (
        select count(*)
        from (
          select regexp_split_to_table(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(content, '```[^`]*```', ' ', 'g'),
                    '!\[[^\]]*\]\([^)]*\)', ' ', 'g'
                  ),
                  '\[([^\]]*)\]\([^)]*\)', '$1', 'g'
                ),
                '^[#>*\-+0-9. ]+', '', 'gm'
              ),
              '`[^`]*`', ' ', 'g'
            ),
            '\s+'
          ) as token
        ) words
        where btrim(token) <> ''
      )::numeric / 180
    )
  )
where content is not null and btrim(content) <> '';