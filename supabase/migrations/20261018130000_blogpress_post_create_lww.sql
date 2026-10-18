-- ============================================================
-- Last-write-wins guard for replayed BlogPress post creates
--
-- ADR-0029 gives every owned write an idempotent upsert keyed on the
-- client-supplied identity; ADR-0033 resolves conflicts by last-write-wins on
-- the client-supplied `updated_at`. Migration 20261017095932 gave that guard to
-- habits, expenses, recurring expenses, categories and short links, but left
-- BlogPress posts out: `createPost` upserted with `{ onConflict: 'id' }` and
-- wrote `updated_at = input.updatedAt ?? now()` unconditionally. A create whose
-- response was lost is retained by the Sync Engine
-- (frontend/shared/local-store/sync-engine.ts drops an entry only on success)
-- and replayed, so if another device edited the post meanwhile the replay
-- re-upserted every original column and the older `updated_at`, silently
-- discarding the newer edit.
--
-- PostgREST's `.upsert()` cannot express a conflict predicate, so the create
-- path gets the same small `SECURITY INVOKER` SQL function as the other owned
-- creates:
--
--   insert ... on conflict (author_id, client_id) do update set ...
--     where posts.updated_at <= excluded.updated_at
--   returning *;
--
-- A conflict that loses the LWW comparison returns zero rows, which the
-- repository reads as "no-op success" and resolves by re-reading the stored
-- winner by `(author_id, client_id)`. The function runs with the caller's
-- privileges, so the existing own-row RLS on `posts` is unchanged, and the
-- `update_posts_updated_at` trigger stays dropped (20261012140354) so the
-- client's logical write time survives the replay.
--
-- `posts_author_id_client_id_key` (20261012140354) is the unique index the
-- conflict target infers; legacy rows keep `client_id = NULL`, which the index
-- treats as distinct, so nothing existing collides.
--
-- Rollback: drop function public.upsert_post(uuid, uuid, uuid, text, text,
--   text, text, text, integer, timestamptz);
-- ============================================================

create or replace function public.upsert_post(
  p_id uuid,
  p_author_id uuid,
  p_client_id uuid,
  p_slug text,
  p_content text,
  p_cover_image text,
  p_meta_title text,
  p_meta_desc text,
  p_reading_time_minutes integer,
  p_updated_at timestamptz
)
returns setof public.posts
language sql
security invoker
set search_path = public
as $$
  insert into public.posts as p
    (id, author_id, client_id, slug, content, cover_image, meta_title, meta_desc, reading_time_minutes, updated_at)
  values
    (p_id, p_author_id, p_client_id, p_slug, p_content, p_cover_image, p_meta_title, p_meta_desc, p_reading_time_minutes, p_updated_at)
  on conflict (author_id, client_id) do update set
    slug = excluded.slug,
    content = excluded.content,
    cover_image = excluded.cover_image,
    meta_title = excluded.meta_title,
    meta_desc = excluded.meta_desc,
    reading_time_minutes = excluded.reading_time_minutes,
    updated_at = excluded.updated_at
  where p.updated_at <= excluded.updated_at
  returning *;
$$;
