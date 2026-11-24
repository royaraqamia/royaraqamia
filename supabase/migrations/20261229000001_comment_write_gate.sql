-- ============================================================
-- Who may write a comment
--
-- A public comment carries a byline, so two gates belong on the write: the
-- writer's address is confirmed, and neither side of the pair has blocked the
-- other. Today `post_comment_create` accepts any member on a public post,
-- while chat already refuses a blocked writer at its insert policy and the
-- profile surfaces already refuse unconfirmed members. A hidden member is NOT
-- refused: ADR-0127 point 5 separates a directory row from a moderation act,
-- and the Playwright fixture is verified.
--
-- One security-definer helper answers the gate; the write calls it and raises,
-- and the service calls the same helper through the repository so a member gets
-- an actionable Arabic sentence instead of a generic 500. Postgres stays the
-- authority: the service's answer is a courtesy, not the rule.
--
-- Rollback:
--   drop function if exists public.post_comment_create(uuid, uuid, text);
--   drop function if exists public.post_comment_write_gate(uuid, uuid);
--   (then restore post_comment_create from 20261212120000_post_engagement.sql)
-- ============================================================

create or replace function public.post_comment_write_gate(p_post_id uuid, p_author_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_verified boolean;
  v_post_author_id uuid;
begin
  select u.verified into v_verified
    from public.users u
   where u.id = p_author_id;

  if coalesce(v_verified, false) = false then
    return 'unverified';
  end if;

  select p.author_id into v_post_author_id
    from public.posts p
   where p.id = p_post_id;

  -- RLS on `blocks` only shows a member the rows they wrote, so this check must
  -- run security definer: a caller-evaluated policy would see one half only.
  if v_post_author_id is not null and exists (
    select 1
      from public.blocks b
     where (b.blocker_id = p_author_id and b.blocked_id = v_post_author_id)
        or (b.blocker_id = v_post_author_id and b.blocked_id = p_author_id)
  ) then
    return 'blocked';
  end if;

  return 'ok';
end;
$$;

revoke all on function public.post_comment_write_gate(uuid, uuid) from public, anon, authenticated;
grant execute on function public.post_comment_write_gate(uuid, uuid) to service_role;

create or replace function public.post_comment_create(
  p_post_id uuid,
  p_author_id uuid,
  p_body text
)
returns table (id uuid, created_at timestamptz, comment_count bigint)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_post public.posts%rowtype;
  v_row public.post_comments%rowtype;
  v_gate text;
begin
  if p_author_id is null then
    raise exception 'post_comment_create: a member is required' using errcode = '28000';
  end if;

  if v_body = '' then
    raise exception 'post_comment_create: an empty comment' using errcode = '22023';
  end if;

  if char_length(v_body) > 2000 then
    raise exception 'post_comment_create: the comment is too long' using errcode = '22001';
  end if;

  select p.* into v_post
    from public.posts p
   where p.id = p_post_id
     and p.status = 'published'
     and p.community_visible = true
     and p.deleted_at is null
  limit 1;

  if v_post.id is null then
    return;
  end if;

  v_gate := public.post_comment_write_gate(p_post_id, p_author_id);
  if v_gate <> 'ok' then
    raise exception 'post_comment_create: %', v_gate using errcode = '28000';
  end if;

  insert into public.post_comments (post_id, author_id, body)
  values (p_post_id, p_author_id, v_body)
  returning * into v_row;

  return query
    select v_row.id, v_row.created_at,
           (select count(*) from public.post_comments c
             where c.post_id = p_post_id and c.deleted_at is null);
end;
$$;

revoke all on function public.post_comment_create(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.post_comment_create(uuid, uuid, text) to service_role;

comment on function public.post_comment_write_gate(uuid, uuid) is
  'ok, unverified or blocked: the two rules a public comment writer must pass. A hidden verified member passes (ADR-0127). Service-role only.';
