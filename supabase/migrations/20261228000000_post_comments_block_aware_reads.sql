-- ============================================================
-- Block-aware comment pages
--
-- `public.blocks` is one block list for the whole site: the personal feed hides
-- a blocked pair in both directions, and chat refuses the blocked writer. A
-- comment thread did neither — a blocked member's words stayed in every
-- thread, including the thread of the member who blocked them (ADR-0217
-- decision 2).
--
-- One read function owns the rule. It filters BEFORE the keyset limit, so a
-- page still holds a full page of rows: filtering after paging would make a
-- page short and break the cursor. The block half goes through
-- `private.not_blocked_with`, a security-definer helper: RLS on `blocks` only
-- shows a member the rows they wrote, so a check evaluated with the caller's
-- role would see one half of the pair.
--
-- The total is deliberately NOT filtered: it is the public live-comment count
-- the feed's action bar prints, and the contract says a blocked viewer may see
-- a total above the rows they can read. Making it viewer-specific would break
-- the batched count the feed shares between both clients.
--
-- Rollback:
--   drop function if exists public.post_comments_page(uuid, uuid, timestamptz, uuid, integer);
-- ============================================================

create or replace function public.post_comments_page(
  p_post_id uuid,
  p_viewer_id uuid,
  p_cursor_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns table (
  id uuid,
  author_id uuid,
  body text,
  created_at timestamptz,
  edited_at timestamptz
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  -- SECURITY DEFINER bypasses the table's RLS, so the public-post test is
  -- restated here, the same one the comment policy and the write functions ask.
  return query
    select c.id, c.author_id, c.body, c.created_at, c.edited_at
      from public.post_comments c
     where c.post_id = p_post_id
       and c.deleted_at is null
       and exists (
         select 1
           from public.posts p
          where p.id = c.post_id
            and p.status = 'published'
            and p.community_visible = true
            and p.deleted_at is null
            and p.published_at is not null
            and p.published_at <= now()
       )
       and (p_viewer_id is null or private.not_blocked_with(c.author_id, p_viewer_id))
       and (
         p_cursor_at is null
         or (c.created_at, c.id) < (p_cursor_at, p_cursor_id)
       )
     order by c.created_at desc, c.id desc
     limit v_limit + 1;
end;
$$;

revoke all on function public.post_comments_page(uuid, uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.post_comments_page(uuid, uuid, timestamptz, uuid, integer)
  to service_role;

comment on function public.post_comments_page(uuid, uuid, timestamptz, uuid, integer) is
  'One block-filtered keyset page of a public post''s live comments, newest first. The viewer is optional: null means a guest. The public live total is read separately (#1797). Service-role only.';
