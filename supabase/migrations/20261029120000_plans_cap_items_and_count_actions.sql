-- ============================================================
-- Plans cap items and count actions; there is no credit pool
--
-- ADR-0075 introduced two allowances and a rolling credit ledger. This
-- migration keeps the first and replaces the second, because a shared balance
-- let a free account trade a post for a download and reset every 30 days:
--
--   * `plan_limits` — owned-item caps. Deleting an item frees its slot; nothing
--     resets. Numbers are updated here to 5 / 50 (MCP apps stay 1 / 10).
--   * `usage_limits` — counted actions that leave no row to count. A `lifetime`
--     count never refills (a download is never given back); a `daily` count
--     resets at Damascus midnight (digests opened, scans, surah reads).
--   * `usage_events` — an append-only count. No cost, no window arithmetic, no
--     refund of a "spend": a refused action never wrote a row, and a failed one
--     deletes the row it wrote.
--
-- Visitors are identified by a first-party cookie (`visitor_key`) *and* the
-- salted IP hash, so clearing the cookie does not reset a lifetime allowance.
-- Both are checked when counting, which is why one shared address is a shared
-- visitor allowance.
--
-- This is a breaking change for accounts above a new cap: every row is kept and
-- only the next create is refused (ADR-0075's grandfathering rule, unchanged).
--
-- Rollback: restore `20261022120000_create_plans_and_usage.sql` and the
-- migrations after it; this file drops the credit RPCs and the cost table, so
-- there is no in-place rollback that keeps their data.
-- ============================================================

-- ------------------------------------------------------------
-- Owned-item caps: the new numbers
-- ------------------------------------------------------------
insert into public.plan_limits (key, label_ar, free_cap, pro_cap, sort_order) values
  ('habits',               'العادات',                 5, 50,  10),
  ('expenses',             'المصروفات',               5, 50,  20),
  ('expense_categories',   'فئات المصروفات',           5, 50,  30),
  ('budgets',              'الميزانيات',               5, 50,  40),
  ('short_links',          'الروابط المختصرة',          5, 50,  50),
  ('community_drafts',     'مسودات المنشورات',          5, 50,  60),
  ('community_published',  'المنشورات المنشورة',        5, 50,  70),
  ('community_tags',       'وسوم المنشورات',            5, 50,  80),
  ('community_categories', 'فئات المنشورات',            5, 50,  90),
  ('quran_bookmarks',      'علامات القرآن',             5, 50, 100),
  ('notes',                'الملاحظات',                 5, 50, 115),
  ('mcp_connected_apps',   'تطبيقات MCP المتصلة',       1, 10, 110)
on conflict (key) do update
  set label_ar = excluded.label_ar,
      free_cap = excluded.free_cap,
      pro_cap = excluded.pro_cap,
      sort_order = excluded.sort_order,
      updated_at = now();

comment on table public.plan_limits is
  'Standing owned-item caps per product, per plan. Deleting an item frees its slot; nothing resets (ADR-0093).';

-- ------------------------------------------------------------
-- Counted actions: the catalogue
-- ------------------------------------------------------------
create table if not exists public.usage_limits (
  key text primary key,
  label_ar text not null,
  -- `window` is a reserved word in Postgres, so the column is quoted wherever
  -- it stands alone (a qualified `l.window` needs no quotes). The name keeps
  -- the vocabulary the contract and the ADR use.
  "window" text not null check ("window" in ('lifetime', 'daily')),
  visitor_cap integer not null check (visitor_cap >= 0),
  free_cap integer not null check (free_cap >= 0),
  pro_cap integer not null check (pro_cap >= 0),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.usage_limits
  (key, label_ar, "window", visitor_cap, free_cap, pro_cap, sort_order) values
  ('downloader.job.create', 'تنزيل وسائط',              'lifetime', 1, 5, 50, 10),
  ('news.digest.open',      'فتح مُلخَّص أخبار',          'daily',    1, 5, 50, 20),
  ('scanner.scan',          'مسح رمز',                   'daily',    1, 5, 50, 30),
  ('quran.surah.read',      'قراءة سورة في اليوم',       'daily',    1, 5, 50, 40)
on conflict (key) do update
  set label_ar = excluded.label_ar,
      "window" = excluded."window",
      visitor_cap = excluded.visitor_cap,
      free_cap = excluded.free_cap,
      pro_cap = excluded.pro_cap,
      sort_order = excluded.sort_order,
      updated_at = now();

alter table public.usage_limits enable row level security;

revoke all on public.usage_limits from anon, authenticated;
grant select on public.usage_limits to anon, authenticated;

drop policy if exists "usage_limits_public_read" on public.usage_limits;
create policy "usage_limits_public_read" on public.usage_limits
  for select to anon, authenticated using (true);

comment on table public.usage_limits is
  'Counted actions that leave no row to count: a lifetime or daily cap per plan and per visitor (ADR-0093).';

-- ------------------------------------------------------------
-- The ledger: a count, not a spend
-- ------------------------------------------------------------

-- The credit window is gone, and so is everything it recorded: the new caps
-- start from zero rather than counting a history priced in credits.
delete from public.usage_events;

alter table public.usage_events
  drop constraint if exists usage_events_action_key_fkey;

alter table public.usage_events
  drop constraint if exists usage_events_one_subject;

alter table public.usage_events
  drop column if exists cost;

alter table public.usage_events
  add column if not exists visitor_key text,
  add column if not exists dedupe_key text;

alter table public.usage_events
  add constraint usage_events_one_subject
  check ((user_id is null) <> (visitor_key is null));

create index if not exists idx_usage_events_action_window
  on public.usage_events (action_key, created_at desc);

create index if not exists idx_usage_events_visitor_window
  on public.usage_events (visitor_key, action_key, created_at desc)
  where visitor_key is not null;

create index if not exists idx_usage_events_ip_window
  on public.usage_events (ip_hash, action_key, created_at desc)
  where ip_hash is not null;

-- Re-opening the same digest, or re-reading the same surah, is not another
-- counted action. The key is minted by the caller and scoped to the subject.
create unique index if not exists idx_usage_events_user_dedupe
  on public.usage_events (user_id, action_key, dedupe_key)
  where dedupe_key is not null and user_id is not null;

create unique index if not exists idx_usage_events_visitor_dedupe
  on public.usage_events (visitor_key, action_key, dedupe_key)
  where dedupe_key is not null and visitor_key is not null;

comment on table public.usage_events is
  'Append-only count of counted actions. Exactly one subject: user_id or a visitor_key, with the salted ip_hash kept for the visitor rule (ADR-0093).';

comment on column public.usage_events.visitor_key is
  'First-party visitor cookie id. Paired with ip_hash so clearing one does not reset a lifetime allowance.';
comment on column public.usage_events.dedupe_key is
  'Makes an action once per window: the digest day, or the surah and its day.';

-- ------------------------------------------------------------
-- Retire the credit pool
-- ------------------------------------------------------------
drop function if exists public.spend_credits_once(uuid, text, uuid);
drop function if exists public.spend_credits(uuid, text);
drop function if exists public.spend_anonymous_credits(text, text);
drop function if exists public.refund_credits(uuid, uuid);
drop function if exists public.refund_anonymous_credits(text, uuid);
drop function if exists public.get_usage_state(uuid);
drop function if exists public.list_user_usage(text, integer, integer);

drop table if exists public.usage_action_costs;

alter table public.plan_settings
  drop column if exists free_credits,
  drop column if exists pro_credits,
  drop column if exists anonymous_daily_credits,
  drop column if exists window_days;

comment on table public.plan_settings is
  'Single row: plan price, currency and duration. Allowances live in plan_limits and usage_limits (ADR-0093).';

alter table public.user_plans
  drop column if exists window_reset_at;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

-- The plan in force for a user right now; an absent or lapsed row is free.
create or replace function private.effective_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = 'public'
as $$
  select coalesce((
    select case
             when up.plan = 'pro' and up.expires_at is not null and up.expires_at > now()
               then 'pro'
             else 'free'
           end
    from public.user_plans up
    where up.user_id = p_user_id
  ), 'free');
$$;

revoke all on function private.effective_plan(uuid) from public;
revoke all on function private.effective_plan(uuid) from anon;
revoke all on function private.effective_plan(uuid) from authenticated;

-- The start of the current Damascus day: every daily count flips together.
create or replace function private.damascus_day_start()
returns timestamptz
language sql
stable
as $$
  select date_trunc('day', now() at time zone 'Asia/Damascus') at time zone 'Asia/Damascus';
$$;

revoke all on function private.damascus_day_start() from public;
revoke all on function private.damascus_day_start() from anon;
revoke all on function private.damascus_day_start() from authenticated;

-- How many times the subject did this action since `p_start`.
--
-- A visitor is counted by cookie *and* by salted address: the two identify one
-- allowance, so a cleared cookie on the same connection is still the same
-- visitor.
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
         and (
           (p_visitor_key is not null and e.visitor_key = p_visitor_key)
           or (p_ip_hash is not null and e.ip_hash = p_ip_hash)
         )
       )
     );
$$;

revoke all on function private.usage_count(text, uuid, text, text, timestamptz)
  from public;
revoke all on function private.usage_count(text, uuid, text, text, timestamptz)
  from anon;
revoke all on function private.usage_count(text, uuid, text, text, timestamptz)
  from authenticated;

-- ------------------------------------------------------------
-- The cap trigger reads the new plan resolver
-- ------------------------------------------------------------
-- `assert_owned_item_cap` is the enforcement point for every capped table, and
-- it read `private.plan_window`, which existed only to compute a credit window.
-- The body below is the 20261023140000 one with that one line replaced, so the
-- trigger keeps its lock, its `PL001` code and its admin exemption.
create or replace function private.assert_owned_item_cap(
  p_user_id uuid,
  p_item text,
  p_incoming integer default 1
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_plan text;
  v_cap integer;
  v_count integer;
  v_admin boolean;
begin
  if p_user_id is null then
    return;
  end if;

  -- Admin allowance is reported as unlimited everywhere else, so it is exempt
  -- here too. `users.is_admin` is the synced mirror of the ADMIN_EMAILS
  -- allowlist (`sync_admin_flag`).
  select exists (
    select 1 from public.users u where u.id = p_user_id and u.is_admin
  ) into v_admin;

  if v_admin then
    return;
  end if;

  -- One lock per (owner, item). The count below therefore runs against a state
  -- no concurrent insert for the same owner and item can move, and the lock is
  -- held until the transaction commits.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_item, 0));

  v_plan := private.effective_plan(p_user_id);

  select case when v_plan = 'pro' then l.pro_cap else l.free_cap end
    into v_cap
    from public.plan_limits l
   where l.key = p_item;

  -- An item the catalog does not cap has nothing to enforce.
  if v_cap is null then
    return;
  end if;

  v_count := private.owned_item_count(p_user_id, p_item);

  if v_count + greatest(coalesce(p_incoming, 1), 0) > v_cap then
    -- A dedicated SQLSTATE, not a generic check violation: a caller that must
    -- survive a refusal (the monthly recurring materialiser) catches exactly
    -- this, and a real constraint failure still raises.
    raise exception 'the plan cap for % is reached', p_item
      using errcode = 'PL001',
            detail = p_item,
            hint = v_cap::text;
  end if;
end;
$$;

revoke all on function private.assert_owned_item_cap(uuid, text, integer)
  from public;
revoke all on function private.assert_owned_item_cap(uuid, text, integer)
  from anon;
revoke all on function private.assert_owned_item_cap(uuid, text, integer)
  from authenticated;

drop function if exists private.plan_window(uuid);

-- ------------------------------------------------------------
-- Recording one counted action
-- ------------------------------------------------------------
-- Count one action, or refuse it.
--
-- The count and the insert are one transaction under an advisory lock keyed on
-- the subject, so two concurrent requests cannot both take the last slot — the
-- property the credit pool had and the one the caps need. A refusal writes
-- nothing, so there is nothing to refund; a caller whose action then fails
-- deletes the event it just wrote (`release_usage`).
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
  v_subject text;
begin
  select * into v_limit from public.usage_limits where key = p_action_key;
  if not found then
    raise exception 'unknown usage action %', p_action_key using errcode = '22023';
  end if;

  if p_user_id is null and coalesce(btrim(p_visitor_key), '') = '' then
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
    v_subject := 'v:' || p_visitor_key;
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
  -- twice is one digest, and the same surah re-read today is one surah.
  if p_dedupe_key is not null then
    if exists (
      select 1
        from public.usage_events e
       where e.action_key = p_action_key
         and e.dedupe_key = p_dedupe_key
         and e.created_at >= v_start
         and (
           (p_user_id is not null and e.user_id = p_user_id)
           or (p_user_id is null and e.visitor_key = p_visitor_key)
         )
    ) then
      v_used := private.usage_count(p_action_key, p_user_id, p_visitor_key, p_ip_hash, v_start);
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
  -- refuses to count it twice.
  if p_client_event_id is not null then
    if exists (
      select 1
        from public.usage_events e
       where e.client_event_id = p_client_event_id
         and (p_user_id is null or e.user_id = p_user_id)
    ) then
      v_used := private.usage_count(p_action_key, p_user_id, p_visitor_key, p_ip_hash, v_start);
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

  v_used := private.usage_count(p_action_key, p_user_id, p_visitor_key, p_ip_hash, v_start);

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
    case when p_user_id is null then p_visitor_key end,
    p_ip_hash,
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

/**
 * Give a counted action back when the work behind it failed. Scoped to the
 * subject so one account cannot delete another's event.
 */
create or replace function public.release_usage(p_event_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_deleted integer;
begin
  delete from public.usage_events
   where id = p_event_id
     and (p_user_id is null or user_id = p_user_id);

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.release_usage(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_usage(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- The account's counters
-- ------------------------------------------------------------
create or replace function public.get_usage_counters(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_plan text;
  v_admin boolean;
  v_expires timestamptz;
  v_counters jsonb;
begin
  select coalesce(u.is_admin, false) into v_admin
    from public.users u where u.id = p_user_id;
  v_admin := coalesce(v_admin, false);

  v_plan := private.effective_plan(p_user_id);

  select up.expires_at into v_expires
    from public.user_plans up
   where up.user_id = p_user_id
     and up.plan = 'pro'
     and up.expires_at is not null
     and up.expires_at > now();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', s.key,
        'label', s.label_ar,
        'window', s.window,
        'cap', s.cap,
        'used', s.used,
        'remaining', greatest(s.cap - s.used, 0)
      )
      order by s.sort_order
    ),
    '[]'::jsonb
  )
  into v_counters
  from (
    select
      l.key,
      l.label_ar,
      l.window,
      l.sort_order,
      case when v_admin then 0 when v_plan = 'pro' then l.pro_cap else l.free_cap end as cap,
      private.usage_count(
        l.key,
        p_user_id,
        null,
        null,
        case when l.window = 'daily' then private.damascus_day_start()
             else '-infinity'::timestamptz end
      ) as used
    from public.usage_limits l
  ) s;

  return jsonb_build_object(
    'plan', v_plan,
    'unlimited', v_admin,
    'expiresAt', v_expires,
    'counters', v_counters
  );
end;
$$;

revoke all on function public.get_usage_counters(uuid) from public, anon, authenticated;
grant execute on function public.get_usage_counters(uuid) to service_role;

-- ------------------------------------------------------------
-- Admin Console list
-- ------------------------------------------------------------
create or replace function public.list_user_usage(
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_term text := nullif(btrim(coalesce(p_search, '')), '');
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_total integer;
  v_users jsonb;
begin
  with matched as (
    select u.id, u.name, u.email, u.is_admin
      from public.users u
     where v_term is null
        or u.name ilike '%' || v_term || '%'
        or u.email ilike '%' || v_term || '%'
  ),
  page_rows as (
    select
      m.id,
      m.name,
      m.email,
      m.is_admin,
      case
        when up.plan = 'pro' and up.expires_at is not null and up.expires_at > now()
          then 'pro'
        else 'free'
      end as plan,
      case
        when up.plan = 'pro' and up.expires_at is not null and up.expires_at > now()
          then up.expires_at
      end as expires_at
    from matched m
    left join public.user_plans up on up.user_id = m.id
    order by m.name nulls last, m.email
    limit v_size offset (v_page - 1) * v_size
  ),
  enriched as (
    select
      r.id,
      r.name,
      r.email,
      r.is_admin,
      r.plan,
      r.expires_at,
      (select count(*) from matched) as total,
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'key', s.key,
                   'label', s.label_ar,
                   'used', s.used,
                   'cap', s.cap
                 )
                 order by s.sort_order
               )
          from (
            select
              l.key,
              l.label_ar,
              l.sort_order,
              case
                when r.plan = 'pro' then l.pro_cap
                else l.free_cap
              end as cap,
              private.usage_count(
                l.key,
                r.id,
                null,
                null,
                case when l.window = 'daily' then private.damascus_day_start()
                     else '-infinity'::timestamptz end
              ) as used
            from public.usage_limits l
          ) s
      ), '[]'::jsonb) as counters
    from page_rows r
  )
  select
    coalesce(max(e.total), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'userId', e.id,
          'name', e.name,
          'email', e.email,
          'plan', e.plan,
          'expiresAt', e.expires_at,
          'unlimited', e.is_admin,
          'counters', e.counters
        )
        order by e.name nulls last, e.email
      ),
      '[]'::jsonb
    )
  into v_total, v_users
  from enriched e;

  return jsonb_build_object(
    'total', v_total,
    'page', v_page,
    'pageSize', v_size,
    'users', v_users
  );
end;
$$;

revoke all on function public.list_user_usage(text, integer, integer) from public;
revoke all on function public.list_user_usage(text, integer, integer) from anon;
revoke all on function public.list_user_usage(text, integer, integer) from authenticated;
grant execute on function public.list_user_usage(text, integer, integer) to service_role;

-- ------------------------------------------------------------
-- Activation: no window to reset any more
-- ------------------------------------------------------------
create or replace function public.activate_plan(
  p_user_id uuid,
  p_activated_by uuid,
  p_amount_cents integer default 0,
  p_method text default 'other',
  p_note text default null,
  p_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_settings public.plan_settings;
  v_days integer;
  v_current timestamptz;
  v_expiry timestamptz;
begin
  select * into v_settings from public.plan_settings where id;

  v_days := coalesce(p_days, v_settings.duration_days);
  if v_days <= 0 then
    raise exception 'activation days must be positive' using errcode = '22023';
  end if;

  select expires_at into v_current
    from public.user_plans
   where user_id = p_user_id;

  v_expiry := greatest(now(), coalesce(v_current, now())) + make_interval(days => v_days);

  insert into public.plan_activations (
    user_id, plan, amount_cents, currency, method, note, activated_by, expires_at
  ) values (
    p_user_id,
    'pro',
    greatest(coalesce(p_amount_cents, 0), 0),
    v_settings.currency,
    coalesce(p_method, 'other'),
    nullif(btrim(coalesce(p_note, '')), ''),
    p_activated_by,
    v_expiry
  );

  insert into public.user_plans (user_id, plan, expires_at, updated_at, updated_by)
  values (p_user_id, 'pro', v_expiry, now(), p_activated_by)
  on conflict (user_id) do update
    set plan = 'pro',
        expires_at = excluded.expires_at,
        updated_at = now(),
        updated_by = excluded.updated_by;

  return jsonb_build_object('plan', 'pro', 'expiresAt', v_expiry, 'days', v_days);
end;
$$;

revoke all on function public.activate_plan(uuid, uuid, integer, text, text, integer) from public;
revoke all on function public.activate_plan(uuid, uuid, integer, text, text, integer) from anon;
revoke all on function public.activate_plan(uuid, uuid, integer, text, text, integer) from authenticated;
grant execute on function public.activate_plan(uuid, uuid, integer, text, text, integer) to service_role;

-- ------------------------------------------------------------
-- Scheduled posts: promotion no longer buys a credit
-- ------------------------------------------------------------
create or replace function public.publish_due_scheduled_posts()
returns integer
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_due record;
  v_promoted integer := 0;
begin
  for v_due in
    select p.id, p.author_id, p.publish_at
      from public.posts p
     where p.status = 'scheduled'
       and p.publish_at is not null
       and p.publish_at <= now()
       and p.deleted_at is null
     order by p.publish_at
       for update skip locked
  loop
    -- The `enforce_plan_cap_published` trigger does not fire for a status
    -- transition on a live row, so the published cap is asked for explicitly.
    begin
      perform private.assert_owned_item_cap(v_due.author_id, 'community_published');
    exception
      when sqlstate 'PL001' then
        continue;
    end;

    update public.posts p
       set status = 'published',
           published_at = coalesce(p.publish_at, now()),
           community_visible = true,
           updated_at = now()
     where p.id = v_due.id
       and p.status = 'scheduled'
       and p.deleted_at is null;

    if found then
      v_promoted := v_promoted + 1;
    end if;
  end loop;

  return v_promoted;
end;
$fn$;

revoke execute on function public.publish_due_scheduled_posts()
  from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'publish-due-scheduled-posts') then
    perform cron.schedule(
      'publish-due-scheduled-posts',
      '*/5 * * * *',
      $$select public.publish_due_scheduled_posts()$$
    );
  end if;
end;
$do$;
