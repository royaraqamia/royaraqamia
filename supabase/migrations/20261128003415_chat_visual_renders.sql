-- 0215 amendment / #1776: code-animated MP4 on the origin.
--
-- The still drawing stays the page's lane. A drawing that declares motion is
-- queued here, and a per-minute doorbell wakes the app's render worker, which
-- claims one row under a lease, paints the bounded frames and muxes them with
-- ffmpeg. The finished clip is stored in `chat-attachments` and written to the
-- thread as one assistant message, so the member reads it through the same
-- signed media route every attachment uses. The member never reads this table.
--
-- Provision once, to switch the worker on (same shape as `wake_agent_turns`):
--   select vault.create_secret('https://royaraqamia.com/api/cron/visual-renders',
--                              'visual_render_worker_url');
--   select vault.create_secret('<CRON_SECRET>', 'visual_render_worker_token');
--
-- Rollback:
--   select cron.unschedule('visual-renders-wake');
--   drop function if exists public.wake_visual_renders();
--   drop function if exists public.claim_visual_render(uuid);
--   drop function if exists public.visual_renders_due(integer);
--   drop table if exists public.chat_visual_renders;
-- ============================================================

create table if not exists public.chat_visual_renders (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  member_id uuid not null references public.users (id) on delete cascade,
  -- The sanitized VisualSpec, animation included. This is data, never code.
  spec jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'rendering', 'done', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  claimed_at timestamptz,
  output_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_visual_renders_due_idx
  on public.chat_visual_renders (created_at)
  where status in ('queued', 'rendering');

create index if not exists chat_visual_renders_conversation_idx
  on public.chat_visual_renders (conversation_id);

-- The queue is the server's alone: the result reaches the member as a chat
-- message, and that route already pins the conversation. Service role bypasses
-- RLS but still needs the object grants below (2026-10-30 change).
alter table public.chat_visual_renders enable row level security;

revoke all on public.chat_visual_renders from public, anon, authenticated;
grant select, insert, update on public.chat_visual_renders to service_role;

-- ------------------------------------------------------------
-- What is due
-- ------------------------------------------------------------

create or replace function public.visual_renders_due(p_limit integer default 2)
returns table (id uuid)
language sql
stable
security definer
set search_path = 'public'
as $$
  select r.id
    from public.chat_visual_renders r
   where r.attempts < 3
     and (
       r.status = 'queued'
       or (r.status = 'rendering'
           and coalesce(r.claimed_at, r.created_at) < now() - interval '2 minutes')
     )
   order by r.created_at
   limit greatest(1, least(p_limit, 10));
$$;

revoke all on function public.visual_renders_due(integer) from public, anon, authenticated;
grant execute on function public.visual_renders_due(integer) to service_role;

-- ------------------------------------------------------------
-- The claim
-- ------------------------------------------------------------

-- One worker, one clip: the lease is the compare-and-set. A second wake that
-- runs while the first is inside its own two minutes finds nothing to claim.
create or replace function public.claim_visual_render(p_id uuid)
returns setof public.chat_visual_renders
language sql
security definer
set search_path = 'public'
as $$
  update public.chat_visual_renders r
     set status = 'rendering',
         attempts = r.attempts + 1,
         claimed_at = now(),
         updated_at = now()
   where r.id = p_id
     and r.attempts < 3
     and (
       r.status = 'queued'
       or (r.status = 'rendering'
           and coalesce(r.claimed_at, r.created_at) < now() - interval '2 minutes')
     )
   returning r.*;
$$;

revoke all on function public.claim_visual_render(uuid) from public, anon, authenticated;
grant execute on function public.claim_visual_render(uuid) to service_role;

-- ------------------------------------------------------------
-- The doorbell
-- ------------------------------------------------------------

create extension if not exists pg_net;

create or replace function public.wake_visual_renders()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_url   text;
  v_token text;
begin
  if not exists (
    select 1
      from public.chat_visual_renders r
     where r.attempts < 3
       and (
         r.status = 'queued'
         or (r.status = 'rendering'
             and coalesce(r.claimed_at, r.created_at) < now() - interval '2 minutes')
       )
  ) then
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets
   where name = 'visual_render_worker_url'
   limit 1;

  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'visual_render_worker_token'
   limit 1;

  if v_url is null or v_token is null or v_url = '' or v_token = '' then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function public.wake_visual_renders() from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'visual-renders-wake') then
    perform cron.schedule(
      'visual-renders-wake',
      '* * * * *',
      $$select public.wake_visual_renders()$$
    );
  end if;
end;
$do$;

-- ------------------------------------------------------------
-- The health contract
-- ------------------------------------------------------------

-- The job-health sweep reads one expectation row per job. A fresh replay may
-- reach this file before `scheduled_job_health` creates the table, so the insert
-- waits for it; the linked project already has it.
do $do$
begin
  if to_regclass('public.scheduled_job_expectation') is not null then
    insert into public.scheduled_job_expectation (jobid, expected_interval, owner)
    select j.jobid, interval '5 minutes', 'platform'
      from cron.job j
     where j.jobname = 'visual-renders-wake'
    on conflict (jobid) do update
       set expected_interval = excluded.expected_interval,
           owner = excluded.owner;
  end if;
end;
$do$;
