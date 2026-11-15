-- Undo a delete by reviving the tombstone, without carrying the post's body (#1518).
--
-- `public.restore_post` wrote the four content fields from the client's request
-- onto the row it revived. That put back whatever the page had read last, which
-- in a local-first store is a snapshot taken before the delete: an edit another
-- device synced in between was silently replaced, and the undo re-sent a body
-- the server already held. The tombstone keeps its content, its metadata, its
-- tags and every server-owned column, so the revive has nothing to copy back —
-- it clears `deleted_at` and leaves the rest of the row exactly as it stands.
--
-- The body is also the version the undo was based on, and that is what the
-- request now carries instead: `updatedAt`, the stamp the delete answered with.
-- A tombstone whose `updated_at` has moved on since — deleted again, or written
-- after this member's delete — refuses with `P0004` and writes nothing, which
-- the repository answers as a 412 the member can act on. A client that sends no
-- token keeps working (an older bundle, a shipped APK): it revives whatever
-- tombstone it can reach, which is safe now that nothing but `deleted_at` moves.
--
-- The return is the revived row's slug, so the caller revalidates the page it
-- actually brought back instead of the one the request named. `drop` is what
-- allows the return type to change; the grants go back with it.
--
-- Rollback: restore the body from
-- `20261024080034_restore_post_revives_tombstone.sql`.

drop function if exists public.restore_post(jsonb);

create function public.restore_post(p_snapshot jsonb)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_author uuid := auth.uid();
  v_hint_id uuid := nullif(trim(p_snapshot ->> 'id'), '')::uuid;
  v_slug_hint text := nullif(trim(p_snapshot ->> 'slug'), '');
  v_expected timestamptz := nullif(trim(p_snapshot ->> 'updatedAt'), '')::timestamptz;
  v_post_id uuid;
  v_post_slug text;
  v_post_updated_at timestamptz;
begin
  if v_author is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- The id is the precise handle and the slug the older one; one of them has to
  -- be here for the tombstone to be found at all.
  if v_hint_id is null and v_slug_hint is null then
    raise exception 'an id or a slug is required' using errcode = '22023';
  end if;

  -- The matched row must still be this caller's tombstone. The slug fallback
  -- keeps older clients (which did not send an id) working without letting
  -- either key reach another account's row.
  select p.id, p.slug, p.updated_at
    into v_post_id, v_post_slug, v_post_updated_at
    from public.posts p
   where p.author_id = v_author
     and p.deleted_at is not null
     and (
       (v_hint_id is not null and p.id = v_hint_id)
       or p.slug = v_slug_hint
     )
   order by (p.id = v_hint_id) desc nulls last, p.updated_at desc
   limit 1
   for update;

  if v_post_id is null then
    raise exception 'deleted post not found' using errcode = 'P0002';
  end if;

  -- `P0004` is this function's own label in the PL/pgSQL family (no_data_found
  -- is P0002, too_many_rows P0003): the tombstone moved on since the undo was
  -- offered. The repository turns it into a 412 so neither client retries it.
  if v_expected is not null and v_post_updated_at <> v_expected then
    raise exception 'post changed since it was deleted' using errcode = 'P0004';
  end if;

  update public.posts p
     set deleted_at = null,
         updated_at = now()
   where p.id = v_post_id
     and p.author_id = v_author
     and p.deleted_at is not null;

  return v_post_slug;
end;
$$;

revoke all on function public.restore_post(jsonb) from public, anon;
grant execute on function public.restore_post(jsonb) to authenticated, service_role;
