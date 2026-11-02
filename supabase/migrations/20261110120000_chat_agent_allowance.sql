-- ============================================================
-- The assistant's allowance (ADR-0113, #817)
--
-- The assistant answers on Gemini's free tier, which bounds a project, not a
-- member: the free limits are per Google project, so one member asking all day
-- can exhaust the ceiling for everyone. Two numbers therefore exist, and both
-- reset at Damascus midnight, the app's day (`private.damascus_day_start()`):
--
--   per member  40 turns   a `usage_limits` row, enforced by `record_usage`
--                          atomically and reported by `get_usage_counters`
--   per project 200 turns  an `app_settings` row, enforced by the trigger below
--
-- The member's number is zero on the Free plan, which is what makes the
-- assistant a Pro feature: `record_usage` refuses before anything is written,
-- so a Free member's composer is locked rather than failing on the model call.
--
-- The numbers are settings, not constants: a row a person can update after the
-- Pro subscription or a provider change, with no deploy. A trigger cannot read
-- environment variables, which is why the project ceiling lives in
-- `app_settings` rather than in `backend/config/env`.
--
-- Nothing is charged per turn. ADR-0093 replaced credit pricing with counted
-- allowances, so a turn is one counted action, and the provider's own quota is
-- the cost bound.
--
-- Rollback:
--   drop trigger if exists trg_usage_events_chat_agent_project on public.usage_events;
--   drop function if exists private.enforce_chat_agent_project_cap();
--   drop function if exists public.chat_agent_allowance(uuid);
--   delete from public.usage_limits where key = 'chat.agent.turn';
--   alter table public.app_settings
--     drop constraint if exists app_settings_chat_agent_project_turns,
--     drop column if exists chat_agent_project_daily_turns;
-- ============================================================

-- ------------------------------------------------------------
-- The numbers
-- ------------------------------------------------------------

alter table public.app_settings
  add column if not exists chat_agent_project_daily_turns integer not null default 200;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_settings_chat_agent_project_turns'
  ) then
    alter table public.app_settings
      add constraint app_settings_chat_agent_project_turns
      check (chat_agent_project_daily_turns > 0);
  end if;
end;
$$;

-- A member's turns are a counted action like a scan or a surah read, so the
-- existing machinery enforces the cap under an advisory lock and answers the
-- refusal with the counter the client already knows how to read.
insert into public.usage_limits
  (key, label_ar, "window", visitor_cap, free_cap, pro_cap, sort_order) values
  ('chat.agent.turn', 'سؤال للمساعد الذكي', 'daily', 0, 0, 40, 50)
on conflict (key) do update
  set label_ar = excluded.label_ar,
      "window" = excluded."window",
      visitor_cap = excluded.visitor_cap,
      free_cap = excluded.free_cap,
      pro_cap = excluded.pro_cap,
      sort_order = excluded.sort_order,
      updated_at = now();

-- ------------------------------------------------------------
-- The project's ceiling
-- ------------------------------------------------------------

-- `record_usage` counts one subject's actions by construction, so the project's
-- total cannot be asked through it. This trigger is the second wall: every turn
-- passes through the ledger insert, and the count and the insert happen in one
-- transaction under a lock, so two concurrent turns cannot both take the last
-- slot. The wall refuses text, never the member's own message: the ledger row is
-- written before the model is called.
create or replace function private.enforce_chat_agent_project_cap()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_limit integer;
  v_used  integer;
begin
  if new.action_key <> 'chat.agent.turn' then
    return new;
  end if;

  select s.chat_agent_project_daily_turns
    into v_limit
    from public.app_settings s
   where s.id;

  perform pg_advisory_xact_lock(hashtextextended('usage:chat.agent.turn:project', 0));

  select count(*)::integer
    into v_used
    from public.usage_events e
   where e.action_key = 'chat.agent.turn'
     and e.created_at >= private.damascus_day_start();

  if v_used >= coalesce(v_limit, 0) then
    raise exception 'chat agent project daily allowance reached' using errcode = '53400';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_chat_agent_project_cap() from public, anon, authenticated;

drop trigger if exists trg_usage_events_chat_agent_project on public.usage_events;
create trigger trg_usage_events_chat_agent_project
  before insert on public.usage_events
  for each row execute function private.enforce_chat_agent_project_cap();

-- ------------------------------------------------------------
-- What the composer reads
-- ------------------------------------------------------------

-- Both meters in one call, resolved for the caller's effective plan (an expired
-- Pro is Free). `p_user_id` is a parameter rather than `auth.uid()` because the
-- caller is the server's own client: `usage_events` grants nothing to a session,
-- and the project's total is a number no member's RLS can see. Only
-- `service_role` may execute it, so it cannot be asked for somebody else.
create or replace function public.chat_agent_allowance(p_user_id uuid)
returns table (
  plan          text,
  member_used   integer,
  member_cap    integer,
  project_used  integer,
  project_limit integer,
  resets_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_plan       text := private.effective_plan(p_user_id);
  v_cap        integer;
  v_limit      integer;
  v_start      timestamptz := private.damascus_day_start();
  v_local_day  timestamp := now() at time zone 'Asia/Damascus';
begin
  select case when v_plan = 'pro' then l.pro_cap else l.free_cap end
    into v_cap
    from public.usage_limits l
   where l.key = 'chat.agent.turn';

  select s.chat_agent_project_daily_turns
    into v_limit
    from public.app_settings s
   where s.id;

  return query
    select v_plan,
           (
             select count(*)::integer
               from public.usage_events e
              where e.action_key = 'chat.agent.turn'
                and e.user_id = p_user_id
                and e.created_at >= v_start
           ),
           coalesce(v_cap, 0),
           (
             select count(*)::integer
               from public.usage_events e
              where e.action_key = 'chat.agent.turn'
                and e.created_at >= v_start
           ),
           coalesce(v_limit, 0),
           -- The next Damascus midnight, resolved in the zone rather than by
           -- adding 24 hours, so a DST change cannot move the reset by an hour.
           (date_trunc('day', v_local_day) + interval '1 day') at time zone 'Asia/Damascus';
end;
$$;

revoke all on function public.chat_agent_allowance(uuid) from public, anon, authenticated;
grant execute on function public.chat_agent_allowance(uuid) to service_role;
