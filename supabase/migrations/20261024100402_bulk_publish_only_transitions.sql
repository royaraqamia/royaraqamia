-- ============================================================
-- Bulk publish charges only the posts that actually transition (#529)
--
-- The Node pre-check and the credit ledger now count the selection's draft and
-- scheduled posts, not the array length: an already-published post is left
-- untouched, so a bulk publish cannot reset its `published_at` (the same rule
-- #552 applies to a single publish) and a mixed selection is neither
-- overcharged nor refused by a cap it would not exceed.
--
-- `create or replace` keeps the existing signature and grants; only the update
-- filter changes. Unpublish keeps its current behavior.
-- ============================================================

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

  if p_publish then
    select count(*)::integer into v_new
      from public.posts p
     where p.id = any(p_post_ids)
       and p.author_id = v_author
       and p.deleted_at is null
       and p.status <> 'published';

    if v_new > 0 then
      perform private.assert_owned_item_cap(v_author, 'community_published', v_new);
    end if;
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
         and (not p_publish or p.status <> 'published')
       returning p.slug
    )
    select updated.slug from updated;
end;
$$;
