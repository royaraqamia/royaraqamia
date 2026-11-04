-- ============================================================
-- A turn that outlives its request (ADR-0125)
--
-- `agent_turns` records a turn. This migration lets something other than the
-- request finish one:
--
--   - the member's question is kept on the row, so a worker does not have to
--     paginate a thread to find what it is answering;
--   - `claimed_at` is a lease, so two workers cannot take one turn;
--   - `resumes` bounds how many times a turn may be picked up;
--   - `wake_agent_turns()` is the doorbell, called by pg_cron once a minute. It
--     POSTs to the app only when a lease has expired, so a quiet day costs
--     nothing, and it no-ops when its Vault secrets are absent (the inline path
--     keeps working either way).
--
-- The worker acts as the member through a session *this server mints*, never a
-- copy of the browser's: refresh-token rotation is single-use and a copy would
-- sign the member out (`docs/security.md`, ADR-0023's amendment).
--
-- Provision once, to switch the worker on:
--   select vault.create_secret('https://royaraqamia.com/api/internal/agent-turns/run',
--                              'agent_turn_worker_url');
--   select vault.create_secret('<CRON_SECRET>', 'agent_turn_worker_token');
--
-- Rollback:
--   select cron.unschedule('agent-turns-wake');
--   drop function if exists public.wake_agent_turns();
--   drop function if exists public.claim_agent_turn(uuid);
--   drop function if exists public.agent_turns_due(integer);
--   alter table public.agent_turns
--     drop column if exists question,
--     drop column if exists claimed_at,
--     drop column if exists resumes;
-- ============================================================

alter table public.agent_turns
  add column if not exists question text,
  add column if not exists claimed_at timestamptz,
  add column if not exists resumes integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agent_turns_resumes') then
    alter table public.agent_turns
      add constraint agent_turns_resumes check (resumes between 0 and 3);
  end if;
end;
$$;

-- ------------------------------------------------------------
-- What is abandoned
-- ------------------------------------------------------------

-- A turn whose request is gone. The inline path caps itself well under two
-- minutes, so a row still `running` after that is a request that died.
create or replace function public.agent_turns_due(p_limit integer default 5)
returns table (id uuid)
language sql
stable
security definer
set search_path = 'public'
as $$
  select t.id
    from public.agent_turns t
   where t.state = 'running'
     and t.resumes < 3
     and t.question is not null
     and coalesce(t.claimed_at, t.created_at) < now() - interval '2 minutes'
   order by t.created_at
   limit greatest(1, least(p_limit, 20));
$$;

revoke all on function public.agent_turns_due(integer) from public, anon, authenticated;
grant execute on function public.agent_turns_due(integer) to service_role;

-- ------------------------------------------------------------
-- The claim
-- ------------------------------------------------------------

-- One worker, one turn: the lease is the compare-and-set. A second worker that
-- runs while the first is inside its own two minutes finds nothing to claim.
create or replace function public.claim_agent_turn(p_turn_id uuid)
returns setof public.agent_turns
language sql
security definer
set search_path = 'public'
as $$
  update public.agent_turns t
     set claimed_at = now(),
         resumes = t.resumes + 1
   where t.id = p_turn_id
     and t.state = 'running'
     and t.resumes < 3
     and t.question is not null
     and coalesce(t.claimed_at, t.created_at) < now() - interval '2 minutes'
   returning t.*;
$$;

revoke all on function public.claim_agent_turn(uuid) from public, anon, authenticated;
grant execute on function public.claim_agent_turn(uuid) to service_role;

-- ------------------------------------------------------------
-- The doorbell
-- ------------------------------------------------------------

create extension if not exists pg_net;

create or replace function public.wake_agent_turns()
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
      from public.agent_turns t
     where t.state = 'running'
       and t.resumes < 3
       and t.question is not null
       and coalesce(t.claimed_at, t.created_at) < now() - interval '2 minutes'
  ) then
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets
   where name = 'agent_turn_worker_url'
   limit 1;

  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'agent_turn_worker_token'
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

revoke all on function public.wake_agent_turns() from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'agent-turns-wake') then
    perform cron.schedule(
      'agent-turns-wake',
      '* * * * *',
      $$select public.wake_agent_turns()$$
    );
  end if;
end;
$do$;
