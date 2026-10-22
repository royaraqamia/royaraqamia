-- Plans: idempotent spend for client-reported local counters (ADR-0075).
--
-- The scanner and the Quran reader count their actions on the device, because
-- neither may depend on the network (ADR-0034, ADR-0056). The count is reported
-- afterwards for reconciliation, so a retried report must not charge the same
-- action twice: the client mints an event id once, and this function records it
-- at most once per account.
--
-- Rollback:
--   drop function if exists public.spend_credits_once(uuid, text, uuid);
--   drop index if exists public.idx_usage_events_user_client_event;
--   alter table public.usage_events drop column if exists client_event_id;

alter table public.usage_events add column if not exists client_event_id uuid;

create unique index if not exists idx_usage_events_user_client_event
  on public.usage_events (user_id, client_event_id)
  where client_event_id is not null;

-- Spend unless this account already recorded this client event. Reusing
-- `spend_credits` keeps one place that knows the cap arithmetic and the admin
-- exemption; this wrapper only adds identity and deduplication.
create or replace function public.spend_credits_once(
  p_user_id uuid,
  p_action_key text,
  p_client_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_settings public.plan_settings;
  v_cost integer;
  v_existing uuid;
  v_result jsonb;
  v_window record;
  v_cap integer;
  v_spent integer;
begin
  if p_client_event_id is null then
    raise exception 'a client event id is required' using errcode = '22023';
  end if;

  select cost into v_cost
  from public.usage_action_costs
  where action_key = p_action_key;

  if v_cost is null then
    raise exception 'unknown usage action: %', p_action_key using errcode = '22023';
  end if;

  -- The same advisory key `spend_credits` takes, held for the check and the
  -- insert: a concurrent replay of one report cannot slip between them.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select id into v_existing
  from public.usage_events
  where user_id = p_user_id
    and client_event_id = p_client_event_id;

  if v_existing is not null then
    select * into v_settings from public.plan_settings where id;
    select * into v_window from private.plan_window(p_user_id);
    v_cap := case
      when v_window.plan = 'pro' then v_settings.pro_credits
      else v_settings.free_credits
    end;
    select coalesce(sum(cost), 0) into v_spent
    from public.usage_events
    where user_id = p_user_id
      and created_at >= v_window.window_start;

    return jsonb_build_object(
      'allowed', true,
      'unlimited', false,
      'plan', v_window.plan,
      'cap', v_cap,
      'spent', v_spent,
      'remaining', greatest(v_cap - v_spent, 0),
      'cost', v_cost,
      'eventId', null,
      'windowDays', v_settings.window_days,
      'expiresAt', v_window.expires_at
    );
  end if;

  v_result := public.spend_credits(p_user_id, p_action_key);

  if coalesce((v_result->>'allowed')::boolean, false)
    and (v_result->>'eventId') is not null
  then
    update public.usage_events
    set client_event_id = p_client_event_id
    where id = (v_result->>'eventId')::uuid;
  end if;

  return v_result;
end;
$$;

revoke all on function public.spend_credits_once(uuid, text, uuid) from public;
revoke all on function public.spend_credits_once(uuid, text, uuid) from anon;
revoke all on function public.spend_credits_once(uuid, text, uuid) from authenticated;
grant execute on function public.spend_credits_once(uuid, text, uuid) to service_role;

comment on column public.usage_events.client_event_id is
  'Client-minted id of a locally counted action; the ledger records each one at most once.';
