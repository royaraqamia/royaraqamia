-- ============================================================
-- A client draft insert is not community-visible (#554)
--
-- `20261023140000_enforce_plan_caps_in_postgres.sql` gave `public.posts` a
-- column guard: the client roles may not set or change `status`,
-- `published_at`, `community_visible`, `view_count` or `featured`, and an
-- INSERT is accepted only when `community_visible` reads false. That check
-- missed the column's own default:
--
--   alter table posts add column blog_visible boolean not null default true;
--   -- 20260728093805, renamed to community_visible by 20261002224417
--
-- `public.upsert_post` is SECURITY INVOKER — it runs as `authenticated` — and
-- its INSERT names neither `community_visible` nor any other server-owned
-- column, so the row arrived with `community_visible = true` and the guard
-- refused it with `42501`. Every create through the Data API 500'd: the
-- BlogPress "new draft" and the offline-replay create, which is why
-- `e2e/blogpress-offline.spec.ts` and the BlogPress case in
-- `e2e/product-offline-render.spec.ts` failed in CI from the guard's merge on.
--
-- A new draft is not community-visible, so the INSERT says so explicitly. The
-- default is left alone: other writers are SECURITY DEFINER RPCs that set every
-- publication column themselves, and changing a NOT NULL default is a wider
-- blast radius than the one insert path that relied on it.
--
-- The ON CONFLICT branch is unchanged on purpose. It updates the editable
-- columns only, so a replay landing on a published row keeps the row's
-- `publish`-owned visibility instead of resetting it.
--
-- Rollback: restore the body from
-- `20261018130000_blogpress_post_create_lww.sql`.
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
    (id, author_id, client_id, slug, content, cover_image, meta_title, meta_desc, reading_time_minutes, community_visible, updated_at)
  values
    (p_id, p_author_id, p_client_id, p_slug, p_content, p_cover_image, p_meta_title, p_meta_desc, p_reading_time_minutes, false, p_updated_at)
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
