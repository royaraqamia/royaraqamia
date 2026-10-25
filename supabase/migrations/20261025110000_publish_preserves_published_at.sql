-- ============================================================
-- Publishing preserves a post's original date (#552)
--
-- `publish_post` stamped `published_at = now()` on every call, including when the
-- row was already published. The Community feed orders by `published_at desc`,
-- so re-saving an old post through the RPC moved it back to the top of the feed:
-- a re-publish takes no new published slot, and it must not buy a fresh date for
-- free either.
--
-- The status is already read before the update, so the write keeps the stored
-- date when the row was published and stamps `now()` only on the draft ->
-- published transition. `bulk_publish_posts` needs nothing here: #529's
-- `20261024100402_bulk_publish_only_transitions.sql` filters already published
-- rows out of its update entirely, so the same rule already holds there.
--
-- `create or replace` keeps the signature and its grants; only the `published_at`
-- expression changes, and the rest of the transition is untouched.
-- ============================================================

create or replace function public.publish_post(p_post_id uuid, p_fields jsonb default '{}'::jsonb)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_author uuid := auth.uid();
  v_status public.post_status;
  v_slug text;
begin
  if v_author is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select p.status into v_status
    from public.posts p
   where p.id = p_post_id
     and p.author_id = v_author
     and p.deleted_at is null;

  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  -- Publishing a draft takes a published slot; re-saving or re-publishing an
  -- already published post does not.
  if v_status <> 'published' then
    perform private.assert_owned_item_cap(v_author, 'community_published');
  end if;

  update public.posts p
     set status = 'published',
         -- The first publication keeps its date for good (#552): `p.published_at`
         -- is the pre-update value, so a re-publish writes the same instant back.
         published_at = case when v_status = 'published' then p.published_at else now() end,
         community_visible = true,
         updated_at = now(),
         slug = coalesce(p_fields ->> 'slug', p.slug),
         content = case
           when p_fields ? 'content' then p_fields ->> 'content' else p.content
         end,
         cover_image = case
           when p_fields ? 'cover_image' then p_fields ->> 'cover_image' else p.cover_image
         end,
         meta_title = case
           when p_fields ? 'meta_title' then p_fields ->> 'meta_title' else p.meta_title
         end,
         meta_desc = case
           when p_fields ? 'meta_desc' then p_fields ->> 'meta_desc' else p.meta_desc
         end,
         reading_time_minutes = case
           when p_fields ? 'reading_time_minutes'
             then (p_fields ->> 'reading_time_minutes')::integer
             else p.reading_time_minutes
         end
   where p.id = p_post_id
     and p.author_id = v_author
   returning p.slug into v_slug;

  return v_slug;
end;
$$;
