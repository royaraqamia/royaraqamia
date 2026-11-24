-- ============================================================
-- The post's host may remove a reply
--
-- ADR-0217 decision 1. Comments shipped with one rule: only the writer may
-- delete. The writer of the post is the person notified of every reply (#1576)
-- and owns the space, so they are the first line of moderation; an
-- email-allowlist Admin team cannot be. This only adds removal — the host never
-- edits another member's words, and `edited_at` still means the writer edited.
--
-- The tombstone records who acted and why. Reads keep filtering every tombstone
-- out, so nothing new appears in the thread: the columns are the audit seam a
-- report queue can point at later, not a visible state.
--
-- Rollback:
--   alter table public.post_comments drop column if exists deleted_reason;
--   alter table public.post_comments drop column if exists deleted_by;
--   (then restore post_comment_delete from 20261212120000_post_engagement.sql)
-- ============================================================

alter table public.post_comments
  add column if not exists deleted_by uuid references public.users (id) on delete set null;

alter table public.post_comments
  add column if not exists deleted_reason text;

comment on column public.post_comments.deleted_by is
  'The member who tombstoned the comment: its writer, or the post''s author (ADR-0217).';
comment on column public.post_comments.deleted_reason is
  'post_author when the post''s host removed a reply; null when its writer deleted it.';

create or replace function public.post_comment_delete(
  p_comment_id uuid,
  p_actor_id uuid
)
returns table (post_id uuid, comment_count bigint)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_post_id uuid;
  v_author_id uuid;
begin
  update public.post_comments c
     set deleted_at = now(),
         deleted_by = p_actor_id,
         deleted_reason = case when c.author_id = p_actor_id then null else 'post_author' end
   where c.id = p_comment_id
     and c.deleted_at is null
     and (
       c.author_id = p_actor_id
       or exists (
         select 1 from public.posts p
          where p.id = c.post_id
            and p.author_id = p_actor_id
            and p.deleted_at is null
       )
     )
   returning c.post_id, c.author_id into v_post_id, v_author_id;

  if v_post_id is null then
    return;
  end if;

  return query
    select v_post_id,
           (select count(*) from public.post_comments c
             where c.post_id = v_post_id and c.deleted_at is null);
end;
$$;

revoke all on function public.post_comment_delete(uuid, uuid) from public, anon, authenticated;
grant execute on function public.post_comment_delete(uuid, uuid) to service_role;

comment on function public.post_comment_delete(uuid, uuid) is
  'Tombstone one live comment by its writer or by the author of its post, and answer the post''s new live-comment count (#1799). Service-role only.';
