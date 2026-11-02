-- ============================================================
-- The assistant's allowance exempts an Admin (ADR-0093, ADR-0113)
--
-- `20261110120000_chat_agent_allowance.sql` resolved the member's cap from
-- `private.effective_plan`, which only reads `user_plans`. An Admin holds no
-- activation, so the function answered `free` with `member_cap = 0` and the
-- service refused every turn with the "upgrade to a paid plan" sentence
-- (`chat-agent-service.ts`, `cap === 0`), on the site and in the app.
--
-- That contradicts the one exemption the rest of the allowance machinery
-- applies: `record_usage` short-circuits an Admin as allowed, and
-- `get_usage_counters` reports `unlimited: true`. The assistant's own read is
-- the place that forgot it, so the fix is here and no contract changes: an
-- Admin is answered as `pro` with the Pro cap, which is exactly what the
-- counter reads for a paying member, and the project's daily ceiling
-- (`app_settings.chat_agent_project_daily_turns`) still bounds the provider.
--
-- Rollback: restore the `20261110120000_chat_agent_allowance.sql` body.
-- ============================================================

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
  v_admin      boolean;
  v_plan       text;
  v_cap        integer;
  v_limit      integer;
  v_start      timestamptz := private.damascus_day_start();
  v_local_day  timestamp := now() at time zone 'Asia/Damascus';
begin
  -- The Admin exemption, resolved before the plan because it is the reason the
  -- plan is not the answer: an Admin holds no `user_plans` row.
  select coalesce(u.is_admin, false) into v_admin
    from public.users u where u.id = p_user_id;
  v_admin := coalesce(v_admin, false);

  v_plan := case
              when v_admin then 'pro'
              else private.effective_plan(p_user_id)
            end;

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

comment on function public.chat_agent_allowance(uuid) is
  'The assistant''s two meters for an account, Admin exempted as Pro (ADR-0113).';
