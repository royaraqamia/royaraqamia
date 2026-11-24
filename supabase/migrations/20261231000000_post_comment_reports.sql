-- ============================================================
-- Reports on comments
--
-- ADR-0217 decision 4. A report is a work item with state and evidence, not a
-- notification: the bell's producers are fail-safe and have no queue. This
-- follows `chat_reports` — the database freezes the evidence from the real rows
-- at the moment of reporting, so staff read what the member saw even after the
-- comment is removed. No client may write or change status directly.
--
-- Rollback:
--   drop function if exists public.post_comment_report(uuid, uuid, text);
--   drop function if exists public.post_comment_reports_decide(uuid, text);
--   drop table if exists public.post_comment_reports;
-- ============================================================

create table if not exists public.post_comment_reports (
  id              uuid primary key default gen_random_uuid(),
  comment_id      uuid not null references public.post_comments (id) on delete cascade,
  post_id         uuid not null references public.posts (id) on delete cascade,
  reporter_id     uuid not null references public.users (id) on delete cascade,
  reason          text not null check (reason in ('spam', 'abuse', 'other')),
  snapshot        jsonb not null,
  status          text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at      timestamptz not null default now(),
  unique (reporter_id, comment_id)
);

create index if not exists idx_post_comment_reports_open
  on public.post_comment_reports (created_at desc)
  where status = 'open';

comment on table public.post_comment_reports is
  'A member''s report of a comment, with a snapshot the database froze from the real rows. Admin Console queue; the bell is only a pointer (#1800).';

alter table public.post_comment_reports enable row level security;

drop policy if exists "Members read only their own comment reports" on public.post_comment_reports;
create policy "Members read only their own comment reports"
  on public.post_comment_reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

revoke all on public.post_comment_reports from public, anon, authenticated;
grant select on public.post_comment_reports to authenticated;
grant all on public.post_comment_reports to service_role;

-- The snapshot is built here, from the stored rows: a caller cannot forge the
-- evidence or file an empty report. The post's slug is the deep link a bell
-- notification can carry; the author id identifies who wrote the words.
create or replace function public.post_comment_report(
  p_comment_id uuid,
  p_reporter_id uuid,
  p_reason text
)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_row public.post_comments%rowtype;
  v_snapshot jsonb;
  v_id uuid;
  v_created timestamptz;
begin
  if p_reporter_id is null or p_reason not in ('spam', 'abuse', 'other') then
    raise exception 'post_comment_report: invalid report' using errcode = '22023';
  end if;

  select * into v_row
    from public.post_comments c
   where c.id = p_comment_id
     and c.deleted_at is null;

  if v_row.id is null then
    return;
  end if;

  select jsonb_build_object(
      'commentId', v_row.id,
      'body', v_row.body,
      'authorId', v_row.author_id,
      'createdAt', v_row.created_at,
      'postId', v_row.post_id,
      'postSlug', p.slug
    )
    into v_snapshot
    from public.posts p
   where p.id = v_row.post_id;

  insert into public.post_comment_reports (comment_id, post_id, reporter_id, reason, snapshot)
  values (v_row.id, v_row.post_id, p_reporter_id, p_reason, v_snapshot)
  on conflict (reporter_id, comment_id) do nothing
  returning id, created_at into v_id, v_created;

  return query select v_id, v_created;
end;
$$;

revoke all on function public.post_comment_report(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.post_comment_report(uuid, uuid, text) to service_role;

-- A decision is a server act, never a client update: `authenticated` has no
-- UPDATE grant on the table at all.
create or replace function public.post_comment_reports_decide(
  p_report_id uuid,
  p_status text
)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_id uuid;
  v_status text;
begin
  if p_status not in ('reviewed', 'dismissed') then
    raise exception 'post_comment_reports_decide: invalid decision' using errcode = '22023';
  end if;

  update public.post_comment_reports r
     set status = p_status
   where r.id = p_report_id
     and r.status = 'open'
  returning r.id, r.status into v_id, v_status;

  return query select v_id, v_status;
end;
$$;

revoke all on function public.post_comment_reports_decide(uuid, text) from public, anon, authenticated;
grant execute on function public.post_comment_reports_decide(uuid, text) to service_role;

comment on function public.post_comment_report(uuid, uuid, text) is
  'File a report with a database-built snapshot of the comment and its post. One row per reporter and comment (#1800). Service-role only.';
