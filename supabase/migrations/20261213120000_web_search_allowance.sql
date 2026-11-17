-- ============================================================
-- The assistant searches the web (ADR-0205)
--
-- The turn pays for the question; a search is counted for a different reason:
-- the vendor's free month is shared by the deployment, and no member's
-- allowance can see it. So the number exists on both axes, exactly like the
-- turn's:
--
--   per member   free 5 / pro 15 searches a day, a `usage_limits` row
--                enforced by `record_usage` under the member's own lock
--   per project  25 a day, an `app_settings` row, enforced by the trigger
--                below under one advisory lock so two concurrent turns cannot
--                both take the last search
--
-- 25 a day is 775 of Tavily's 1,000 monthly credits. The remaining 225 are the
-- headroom a busy day borrows from; a quiet month leaves them unspent, which is
-- the price of a daily wall instead of a monthly one.
--
-- A refused search is a tool answer, never a failed turn: the model is told
-- "not now" and answers with what it has. That is why this counter refuses by
-- returning `allowed = false` from `record_usage` and by raising from the
-- trigger — the caller catches both.
--
-- Rollback:
--   drop trigger if exists trg_usage_events_web_search_project on public.usage_events;
--   drop function if exists private.enforce_web_search_project_cap();
--   delete from public.usage_limits where key = 'web.search';
--   alter table public.app_settings
--     drop constraint if exists app_settings_web_search_project_turns,
--     drop column if exists chat_agent_web_search_project_daily_turns;
-- ============================================================

-- ------------------------------------------------------------
-- The numbers
-- ------------------------------------------------------------

alter table public.app_settings
  add column if not exists chat_agent_web_search_project_daily_turns integer not null default 25;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_settings_web_search_project_turns'
  ) then
    alter table public.app_settings
      add constraint app_settings_web_search_project_turns
      check (chat_agent_web_search_project_daily_turns > 0);
  end if;
end;
$$;

insert into public.usage_limits
  (key, label_ar, "window", visitor_cap, free_cap, pro_cap, sort_order) values
  ('web.search', 'بحث في الويب', 'daily', 0, 5, 15, 55)
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

-- The second wall, for the same reason as the turn's: `record_usage` counts one
-- member, and the credits this ceiling protects are the deployment's. The count
-- and the insert happen in one transaction under a lock.
create or replace function private.enforce_web_search_project_cap()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_limit integer;
  v_used  integer;
begin
  if new.action_key <> 'web.search' then
    return new;
  end if;

  select s.chat_agent_web_search_project_daily_turns
    into v_limit
    from public.app_settings s
   where s.id;

  perform pg_advisory_xact_lock(hashtextextended('usage:web.search:project', 0));

  select count(*)::integer
    into v_used
    from public.usage_events e
   where e.action_key = 'web.search'
     and e.created_at >= private.damascus_day_start();

  if v_used >= coalesce(v_limit, 0) then
    raise exception 'web search project daily allowance reached' using errcode = '53400';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_web_search_project_cap() from public, anon, authenticated;

drop trigger if exists trg_usage_events_web_search_project on public.usage_events;
create trigger trg_usage_events_web_search_project
  before insert on public.usage_events
  for each row execute function private.enforce_web_search_project_cap();
