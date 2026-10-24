-- Undo a delete by reviving the tombstone the delete left (#528).
--
-- `public.restore_post` used to INSERT the browser-held snapshot, which let a
-- signed-in caller mint an arbitrary number of draft or published rows (past
-- `community_drafts`/`community_published`), left the tombstone behind, and
-- accepted `status`, `published_at`, `view_count`, `featured`,
-- `community_visible` and `reading_time_minutes` from the client.
--
-- The row already exists: a delete is a tombstone (ADR-0029). Restore looks up
-- the caller's tombstone by id, or by slug, and clears `deleted_at`, applying
-- only the editor-owned content fields. Every server-owned column keeps the
-- value the row had before the delete, so a previously visible published post
-- comes back exactly as it was and a non-admin does not lose community
-- visibility. A missing tombstone raises `P0002` and writes nothing, which also
-- makes a repeated restore a no-op error rather than a duplicate row.
--
-- The cap triggers from `20261023140000_enforce_plan_caps_in_postgres.sql`
-- still run: a tombstone revival is an UPDATE onto a live row, so it takes the
-- slot its status needs and is refused in the same transaction when the plan
-- has none.
--
-- Rollback: restore the previous body from
-- `20261023140000_enforce_plan_caps_in_postgres.sql`.

create or replace function public.restore_post(p_snapshot jsonb)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_author uuid := auth.uid();
  v_hint_id uuid := nullif(trim(p_snapshot ->> 'id'), '')::uuid;
  v_slug text := nullif(trim(p_snapshot ->> 'slug'), '');
  v_post_id uuid;
begin
  if v_author is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_slug is null then
    raise exception 'a slug is required' using errcode = '22023';
  end if;

  -- The id is only a hint: the matched row must still be this caller's
  -- tombstone. The slug fallback keeps older clients (which did not send an id)
  -- working without letting either key reach another account's row.
  select p.id
    into v_post_id
    from public.posts p
   where p.author_id = v_author
     and p.deleted_at is not null
     and (
       (v_hint_id is not null and p.id = v_hint_id)
       or p.slug = v_slug
     )
   order by (p.id = v_hint_id) desc nulls last, p.updated_at desc
   limit 1
   for update;

  if v_post_id is null then
    raise exception 'deleted post not found' using errcode = 'P0002';
  end if;

  update public.posts p
     set deleted_at = null,
         content = p_snapshot ->> 'content',
         cover_image = p_snapshot ->> 'cover_image',
         meta_title = p_snapshot ->> 'meta_title',
         meta_desc = p_snapshot ->> 'meta_desc',
         updated_at = now()
   where p.id = v_post_id
     and p.author_id = v_author
     and p.deleted_at is not null;

  return v_post_id;
end;
$$;

revoke all on function public.restore_post(jsonb) from public, anon;
grant execute on function public.restore_post(jsonb) to authenticated, service_role;
