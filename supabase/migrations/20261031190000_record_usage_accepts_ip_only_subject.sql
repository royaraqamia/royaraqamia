-- A visitor with no cookie is still a visitor (#701)
--
-- `PlanGate.subject` accepts a visitor identified only by the salted address,
-- and ADR-0093 says the cookie and the address are one allowance. The ledger
-- disagreed: `usage_events_one_subject` demanded a `visitor_key`, and
-- `record_usage` raised `22023` for a null one, so the first counted request of
-- a browser that had not stored `rar_visitor` yet answered 500 instead of
-- counting. This replaces the function and relaxes the constraint it writes
-- through; a request with neither a user, a cookie nor an address is still
-- refused.
--
-- Rollback: restore the `usage_events_one_subject` constraint from
-- 20261029120000, drop `idx_usage_events_ip_dedupe`, and `create or replace`
-- the previous `record_usage` body. Any IP-only event has to be deleted first,
-- because the restored constraint refuses it.

-- ------------------------------------------------------------
-- One subject, either of its halves
-- ------------------------------------------------------------
-- The visitor rule is "the count matches either half", so a row may carry one
-- half alone. A user row still carries no cookie, exactly as before.
alter table public.usage_events
  drop constraint if exists usage_events_one_subject;

alter table public.usage_events
  add constraint usage_events_one_subject
  check (
    (user_id is not null and visitor_key is null)
    or (user_id is null and (visitor_key is not null or ip_hash is not null))
  );

comment on table public.usage_events is
  'Append-only count of counted actions. Exactly one subject: user_id, or a signed-out visitor identified by visitor_key, its salted ip_hash, or both (ADR-0093).';

-- A replay is one event for a cookie-only subject; a cookie-less subject needs
-- the same guard on the half it records. Only rows with no `visitor_key` are
-- covered, so the existing visitor index keeps its scope.
create unique index if not exists idx_usage_events_ip_dedupe
  on public.usage_events (ip_hash, action_key, dedupe_key)
  where dedupe_key is not null and visitor_key is null and ip_hash is not null;

-- ------------------------------------------------------------
-- Recording one counted action
-- ------------------------------------------------------------
-- Count one action, or refuse it.
--
-- The count and the insert are one transaction under an advisory lock keyed on
-- the subject, so two concurrent requests cannot both take the last slot. A
-- refusal writes nothing, so there is nothing to refund; a caller whose action
-- then fails deletes the event it just wrote (`release_usage`).
--
-- Admins are unlimited and write no event, exactly as they did before.
create or replace function public.record_usage(
  p_action_key text,
  p_user_id uuid,
  p_visitor_key text default null,
  p_ip_hash text default null,
  p_client_event_id uuid default null,
  p_dedupe_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_limit public.usage_limits;
  v_plan text;
  v_admin boolean := false;
  v_cap integer;
  v_used integer;
  v_start timestamptz;
  v_event_id uuid;
  v_visitor_key text;
  v_ip_hash text;
  v_subject text;
begin
  select * into v_limit from public.usage_limits where key = p_action_key;
  if not found then
    raise exception 'unknown usage action %', p_action_key using errcode = '22023';
  end if;

  -- A blank half is an absent half: the middleware mints the cookie, and the
  -- first counted request of a new visitor arrives before the browser has
  -- stored it, so the address alone identifies that visitor (ADR-0093).
  v_visitor_key := nullif(btrim(p_visitor_key), '');
  v_ip_hash := nullif(btrim(p_ip_hash), '');

  if p_user_id is null and v_visitor_key is null and v_ip_hash is null then
    raise exception 'a counted action needs a signed-in user or a visitor'
      using errcode = '22023';
  end if;

  if p_user_id is not null then
    select coalesce(u.is_admin, false) into v_admin
      from public.users u where u.id = p_user_id;
    v_admin := coalesce(v_admin, false);
    v_plan := private.effective_plan(p_user_id);
    v_cap := case when v_plan = 'pro' then v_limit.pro_cap else v_limit.free_cap end;
    v_subject := 'u:' || p_user_id::text;
  else
    v_plan := 'visitor';
    v_cap := v_limit.visitor_cap;
    -- Keyed on the half the row records: two requests from one cookie-less
    -- visitor take the same lock, and a visitor holding both halves keeps the
    -- lock the cookie has always taken.
    v_subject := case
      when v_visitor_key is not null then 'v:' || v_visitor_key
      else 'ip:' || v_ip_hash
    end;
  end if;

  if v_admin then
    return jsonb_build_object(
      'allowed', true,
      'duplicate', false,
      'eventId', null,
      'counter', jsonb_build_object(
        'key', v_limit.key,
        'label', v_limit.label_ar,
        'window', v_limit.window,
        'cap', 0,
        'used', 0,
        'remaining', 0
      )
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_subject, 0));

  v_start := case
    when v_limit.window = 'daily' then private.damascus_day_start()
    else '-infinity'::timestamptz
  end;

  -- An action already counted in this window is free: the same digest opened
  -- twice is one digest, and the same surah re-read today is one surah. The
  -- subject compared is the one this row would record — the cookie when there
  -- is one, otherwise the address.
  if p_dedupe_key is not null then
    if exists (
      select 1
        from public.usage_events e
       where e.action_key = p_action_key
         and e.dedupe_key = p_dedupe_key
         and e.created_at >= v_start
         and (
           (p_user_id is not null and e.user_id = p_user_id)
           or (
             p_user_id is null
             and (
               (v_visitor_key is not null and e.visitor_key = v_visitor_key)
               or (v_visitor_key is null and e.ip_hash = v_ip_hash)
             )
           )
         )
    ) then
      v_used := private.usage_count(
        p_action_key, p_user_id, v_visitor_key, v_ip_hash, v_start
      );
      return jsonb_build_object(
        'allowed', true,
        'duplicate', true,
        'eventId', null,
        'counter', jsonb_build_object(
          'key', v_limit.key,
          'label', v_limit.label_ar,
          'window', v_limit.window,
          'cap', v_cap,
          'used', v_used,
          'remaining', greatest(v_cap - v_used, 0)
        )
      );
    end if;
  end if;

  -- A replayed local report carries the id it was minted with; the ledger
  -- refuses to count it twice. Scoped to the subject for the same reason the
  -- dedupe key is: another visitor's device cannot suppress this one's event.
  if p_client_event_id is not null then
    if exists (
      select 1
        from public.usage_events e
       where e.client_event_id = p_client_event_id
         and (
           (p_user_id is not null and e.user_id = p_user_id)
           or (
             p_user_id is null
             and (
               (v_visitor_key is not null and e.visitor_key = v_visitor_key)
               or (v_visitor_key is null and e.ip_hash = v_ip_hash)
             )
           )
         )
    ) then
      v_used := private.usage_count(
        p_action_key, p_user_id, v_visitor_key, v_ip_hash, v_start
      );
      return jsonb_build_object(
        'allowed', true,
        'duplicate', true,
        'eventId', null,
        'counter', jsonb_build_object(
          'key', v_limit.key,
          'label', v_limit.label_ar,
          'window', v_limit.window,
          'cap', v_cap,
          'used', v_used,
          'remaining', greatest(v_cap - v_used, 0)
        )
      );
    end if;
  end if;

  v_used := private.usage_count(
    p_action_key, p_user_id, v_visitor_key, v_ip_hash, v_start
  );

  if v_used >= v_cap then
    return jsonb_build_object(
      'allowed', false,
      'duplicate', false,
      'eventId', null,
      'counter', jsonb_build_object(
        'key', v_limit.key,
        'label', v_limit.label_ar,
        'window', v_limit.window,
        'cap', v_cap,
        'used', v_used,
        'remaining', 0
      )
    );
  end if;

  insert into public.usage_events (
    user_id, visitor_key, ip_hash, action_key, client_event_id, dedupe_key
  ) values (
    p_user_id,
    case when p_user_id is null then v_visitor_key end,
    v_ip_hash,
    p_action_key,
    p_client_event_id,
    p_dedupe_key
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'allowed', true,
    'duplicate', false,
    'eventId', v_event_id,
    'counter', jsonb_build_object(
      'key', v_limit.key,
      'label', v_limit.label_ar,
      'window', v_limit.window,
      'cap', v_cap,
      'used', v_used + 1,
      'remaining', greatest(v_cap - v_used - 1, 0)
    )
  );
end;
$$;

revoke all on function public.record_usage(text, uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_usage(text, uuid, text, text, uuid, text)
  to service_role;
