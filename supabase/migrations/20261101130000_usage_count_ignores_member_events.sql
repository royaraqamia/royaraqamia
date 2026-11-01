-- A member's counted action is not a visitor's (#779)
--
-- `record_usage` writes the salted `ip_hash` on every event, member rows
-- included, and `private.usage_count` matched a visitor on the address alone.
-- Together they spent the signed-out allowance of the address behind a
-- signed-in account: sign in, download on Free, sign out, and the visitor on
-- that browser is already out of allowance - and every member behind one
-- address spends the visitor allowance of everyone else behind it.
--
-- ADR-0093 makes the visitor subject the cookie plus the salted address and a
-- member a count of `user_id` alone. The hash stays on the row, because it is
-- the abuse record the ledger keeps, but it no longer identifies a visitor who
-- is not one. Three changes, and no backfill: the guards make the rows already
-- written read correctly, so history needs neither a rewrite nor a delete:
--
--   * `private.usage_count` - the visitor branch also requires `e.user_id is
--     null`, so a member row cannot be counted for a visitor;
--   * `public.record_usage` - the same guard in the visitor dedupe lookup and
--     in the visitor `client_event_id` replay lookup, so a member's key or
--     event id cannot make a visitor's action read as a replay and cost
--     nothing;
--   * `idx_usage_events_ip_dedupe` - `user_id is null` joins its predicate, so a
--     member row is outside an address-keyed index and can neither be refused
--     by it nor suppress a visitor's event through it.
--
-- Nothing else moves: a visitor is still counted on either half of its subject,
-- one shared address is still one visitor allowance, and no cap, window, Admin
-- exemption, refund path or release path changes. `record_usage` still refuses
-- a subject that is neither a user nor a visitor (`22023`) and still answers an
-- Admin without writing an event.
--
-- Rollback: `create or replace` the `record_usage` from 20261031190000 and the
-- `private.usage_count` from 20261029120000 - the bodies this file replaces -
-- then drop this index and recreate `idx_usage_events_ip_dedupe` with its
-- previous predicate (`dedupe_key is not null and visitor_key is null and
-- ip_hash is not null`). The restored index takes member rows again, so a
-- member and a visitor sharing an address could not both record the same key.

-- ------------------------------------------------------------
-- Counting: a visitor is a signed-out subject
-- ------------------------------------------------------------
-- Unchanged except for the `e.user_id is null` line: the user branch already
-- matched one account, and the visitor branch now matches only rows that belong
-- to no account at all.
create or replace function private.usage_count(
  p_action_key text,
  p_user_id uuid,
  p_visitor_key text,
  p_ip_hash text,
  p_start timestamptz
)
returns integer
language sql
stable
security definer
set search_path = 'public'
as $$
  select count(*)::integer
    from public.usage_events e
   where e.action_key = p_action_key
     and e.created_at >= p_start
     and (
       (p_user_id is not null and e.user_id = p_user_id)
       or (
         p_user_id is null
         and e.user_id is null
         and (
           (p_visitor_key is not null and e.visitor_key = p_visitor_key)
           or (p_ip_hash is not null and e.ip_hash = p_ip_hash)
         )
       )
     );
$$;

revoke all on function private.usage_count(text, uuid, text, text, timestamptz)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- Recording one counted action
-- ------------------------------------------------------------
-- The 20261031190000 body with the visitor half of both subject lookups scoped
-- to `e.user_id is null`. A member row shares the address and carries no
-- cookie, so without the guard the address-only halves below read it as this
-- visitor's own earlier event.
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
  -- is one, otherwise the address — and only a row that belongs to no account
  -- is this visitor's: a member's event on the same address is theirs.
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
             and e.user_id is null
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
  -- dedupe key is: another visitor's device cannot suppress this one's event,
  -- and a member's report is not this visitor's replay.
  if p_client_event_id is not null then
    if exists (
      select 1
        from public.usage_events e
       where e.client_event_id = p_client_event_id
         and (
           (p_user_id is not null and e.user_id = p_user_id)
           or (
             p_user_id is null
             and e.user_id is null
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

-- ------------------------------------------------------------
-- The address-keyed replay index is a visitor's index
-- ------------------------------------------------------------
-- A member row carries the address but no cookie, which is exactly the shape
-- the 20261031190000 predicate admits - and a unique index on it refused a
-- visitor's own event with the same `(ip_hash, action_key, dedupe_key)`. The
-- membership is now the one the count uses: no account, so a visitor.
drop index if exists public.idx_usage_events_ip_dedupe;

create unique index if not exists idx_usage_events_ip_dedupe
  on public.usage_events (ip_hash, action_key, dedupe_key)
  where dedupe_key is not null
    and user_id is null
    and visitor_key is null
    and ip_hash is not null;
