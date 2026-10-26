-- ============================================================
-- Unpublishing takes a drafts slot (#603)
--
-- The drafts and published caps are separate buckets, and a status
-- transition is not what the trigger checks (`private.enforce_owned_item_cap`
-- returns early for an update of a live row), so the RPC that performs the
-- transition is the enforcement point. `schedule_post` already charged the
-- published -> scheduled move; `unpublish_post` and the unpublish direction of
-- `bulk_publish_posts` did not, so a free account at the published cap could
-- park ten drafts against a cap of five.
--
-- Only a `published` row moves into the drafts bucket. A `draft` row is a no-op
-- and a `scheduled` row already holds a drafts slot
-- (`private.owned_item_count` counts `status in ('draft', 'scheduled')`), so
-- charging either would refuse a legitimate unpublish and count the row against
-- itself.
-- ============================================================

create or replace function public.unpublish_post(p_post_id uuid)
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

  -- Coming back from published takes a drafts slot, exactly as going the other
  -- way takes a published one. A draft or scheduled row already holds its slot.
  if v_status = 'published' then
    perform private.assert_owned_item_cap(v_author, 'community_drafts');
  end if;

  update public.posts p
     set status = 'draft',
         published_at = null,
         updated_at = now()
   where p.id = p_post_id
     and p.author_id = v_author
     and p.deleted_at is null
   returning p.slug into v_slug;

  return v_slug;
end;
$$;

-- The bulk unpublish counts the rows that actually leave the published bucket,
-- not the selection: a draft is a no-op, a scheduled row is already counted in
-- `community_drafts`, and only a published row needs a slot to come back. One
-- check for the whole batch, so a mixed selection is neither overcharged nor
-- refused by a cap it would not exceed. The update drops the rows that are
-- already drafts for the same reason: re-stamping `updated_at` on one would
-- look like an edit to the LWW sync (ADR-0033) when nothing changed.
create or replace function public.bulk_publish_posts(p_post_ids uuid[], p_publish boolean)
returns setof text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_author uuid := auth.uid();
  v_new integer;
begin
  if v_author is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select count(*)::integer into v_new
    from public.posts p
   where p.id = any(p_post_ids)
     and p.author_id = v_author
     and p.deleted_at is null
     and case
           when p_publish then p.status <> 'published'
           else p.status = 'published'
         end;

  if v_new > 0 then
    perform private.assert_owned_item_cap(
      v_author,
      case when p_publish then 'community_published' else 'community_drafts' end,
      v_new
    );
  end if;

  return query
    with updated as (
      update public.posts p
         set status = case
               when p_publish then 'published'::public.post_status
               else 'draft'::public.post_status
             end,
             published_at = case when p_publish then now() else null end,
             community_visible = case when p_publish then true else p.community_visible end,
             updated_at = now()
       where p.id = any(p_post_ids)
         and p.author_id = v_author
         and (p_publish or p.status <> 'draft')
         and (not p_publish or p.status <> 'published')
       returning p.slug
    )
    select updated.slug from updated;
end;
$$;
