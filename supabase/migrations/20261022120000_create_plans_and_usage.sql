-- ============================================================
-- Plans, credits and owned-item caps
--
-- A user is on one of two plans, both unlimited in time but not in
-- allowance (ADR-0075):
--
--   free  — 100 credits per rolling 30 days, small owned-item caps
--   pro   — 10,000 credits per rolling 30 days, generous caps, 30 days
--
-- This migration is the schema half only: it records the plan, the cost
-- table, the ledger and the caps. Nothing spends a credit yet — the
-- enforcement hooks land separately, so a deploy of this change alone
-- cannot block a single request.
--
-- Two mechanisms, deliberately not merged:
--
--   * usage_events is a rolling spend ledger. It resets (ages out) and is
--     what the account's usage card reports.
--   * plan_limits is a standing ownership cap. Owning a habit does not
--     consume a credit every month; the row either exists or it does not.
--     Merging the two would turn saved data into monthly rent, which
--     ADR-0075 rejects.
--
-- The plan is the source of the cap, never a balance: an activation
-- raises the cap and resets the window; an expiry lowers it and resets
-- the window too, so a lapsed subscriber is not blocked by usage their
-- payment already covered.
--
-- Rollback:
--   drop function if exists public.list_user_usage(text, integer, integer);
--   drop function if exists public.activate_plan(uuid, uuid, integer, text, text, integer);
--   drop function if exists public.refund_anonymous_credits(text, uuid);
--   drop function if exists public.refund_credits(uuid, uuid);
--   drop function if exists public.spend_anonymous_credits(text, text);
--   drop function if exists public.get_usage_state(uuid);
--   drop function if exists public.spend_credits(uuid, text);
--   drop function if exists private.plan_window(uuid);
--   drop table if exists public.plan_activations;
--   drop table if exists public.usage_events;
--   drop table if exists public.user_plans;
--   drop table if exists public.usage_action_costs;
--   drop table if exists public.plan_limits;
--   drop table if exists public.plan_settings;
-- ============================================================

-- ------------------------------------------------------------
-- Catalog: the numbers every surface reads
-- ------------------------------------------------------------

-- One row. The pricing page, the account card and the credit RPCs read the
-- same numbers, so a price or allowance change needs no deploy.
create table if not exists public.plan_settings (
  id boolean primary key default true check (id),
  price_cents integer not null default 1000 check (price_cents >= 0),
  currency text not null default 'USD',
  duration_days integer not null default 30 check (duration_days > 0),
  window_days integer not null default 30 check (window_days > 0),
  free_credits integer not null default 100 check (free_credits >= 0),
  pro_credits integer not null default 10000 check (pro_credits >= 0),
  anonymous_daily_credits integer not null default 10
    check (anonymous_daily_credits >= 0),
  updated_at timestamptz not null default now()
);

insert into public.plan_settings (id) values (true) on conflict (id) do nothing;

-- Standing caps on how many things an account may hold. One row per gated
-- product; the key is the contract both the app and the database use.
create table if not exists public.plan_limits (
  key text primary key,
  label_ar text not null,
  free_cap integer not null check (free_cap >= 0),
  pro_cap integer not null check (pro_cap >= 0),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.plan_limits (key, label_ar, free_cap, pro_cap, sort_order) values
  ('habits',             'العادات',                5,    200,   10),
  ('expenses',           'المصروفات',             100,  10000,  20),
  ('expense_categories', 'فئات المصروفات',         10,    50,   30),
  ('budgets',            'الميزانيات',              3,    30,   40),
  ('short_links',        'الروابط المختصرة',        10,  1000,  50),
  ('community_drafts',   'مسودات المنشورات',         5,   100,   60),
  ('community_published','المنشورات المنشورة',      10,  1000,  70),
  ('community_tags',     'وسوم المنشورات',           5,    50,   80),
  ('community_categories','فئات المنشورات',          3,    30,   90),
  ('quran_bookmarks',    'علامات القرآن',            20, 1000, 100),
  ('mcp_connected_apps', 'تطبيقات MCP المتصلة',       1,    10, 110)
on conflict (key) do nothing;

-- What one metered action costs. Charged only when the action succeeds;
-- reads are absent on purpose (ADR-0075).
create table if not exists public.usage_action_costs (
  action_key text primary key,
  label_ar text not null,
  cost integer not null check (cost > 0),
  sort_order integer not null default 0
);

insert into public.usage_action_costs (action_key, label_ar, cost, sort_order) values
  ('community.post.publish',    'نشر منشور',            10,  10),
  ('community.post.edit',       'تعديل منشور',           1,  20),
  ('community.post.duplicate',  'نسخ منشور',             5,  30),
  ('community.media.upload',    'رفع صورة لمنشور',       2,  40),
  ('linksnap.link.create',      'إنشاء رابط مختصر',      1,  50),
  ('downloader.job.create',     'طلب تنزيل وسائط',       5,  60),
  ('mcp.tool.write',            'استدعاء أداة كتابة MCP', 1,  70),
  ('consultation.booking.create','طلب استشارة',          1,  80),
  ('training.application.submit','طلب التحاق بتدريب',    1,  90),
  ('project_request.submit',    'طلب بناء مشروع',        1, 100),
  ('retainer.submit',           'طلب تعاقد شهري',        1, 110),
  ('scanner.scan',              'مسح رمز',               1, 120),
  ('quran.surah.read',          'قراءة سورة في اليوم',   1, 130)
on conflict (action_key) do nothing;

-- ------------------------------------------------------------
-- Per-user state
-- ------------------------------------------------------------

-- Absent row means free. `window_reset_at` is the floor for the rolling
-- window, moved by an activation so an upgrade starts from zero usage.
create table if not exists public.user_plans (
  user_id uuid primary key references public.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  expires_at timestamptz,
  window_reset_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

-- The rolling spend ledger. Exactly one subject: a signed-in user or a
-- salted IP hash, never both and never neither.
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete cascade,
  ip_hash text,
  action_key text not null references public.usage_action_costs (action_key),
  cost integer not null check (cost > 0),
  created_at timestamptz not null default now(),
  constraint usage_events_one_subject check ((user_id is null) <> (ip_hash is null))
);

create index if not exists idx_usage_events_user_window
  on public.usage_events (user_id, created_at desc)
  where user_id is not null;

create index if not exists idx_usage_events_ip_window
  on public.usage_events (ip_hash, created_at desc)
  where ip_hash is not null;

-- Money moves off-system (ADR-0006): this is the operator's record, not a
-- payment. `expires_at` is what the activation granted, not when it ran.
create table if not exists public.plan_activations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  plan text not null default 'pro' check (plan in ('free', 'pro')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  currency text not null default 'USD',
  method text not null default 'other' check (method in ('shamcash', 'efendim', 'other')),
  note text,
  activated_by uuid references public.users (id) on delete set null,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_plan_activations_user
  on public.plan_activations (user_id, activated_at desc);

-- ------------------------------------------------------------
-- Access control
-- ------------------------------------------------------------

alter table public.plan_settings enable row level security;
alter table public.plan_limits enable row level security;
alter table public.usage_action_costs enable row level security;

-- Catalog rows are public: the pricing page renders them, and the client
-- needs the caps to refuse a write offline before it dares to queue it.
revoke all on public.plan_settings from anon, authenticated;
grant select on public.plan_settings to anon, authenticated;

revoke all on public.plan_limits from anon, authenticated;
grant select on public.plan_limits to anon, authenticated;

revoke all on public.usage_action_costs from anon, authenticated;
grant select on public.usage_action_costs to anon, authenticated;

drop policy if exists "plan_settings_public_read" on public.plan_settings;
create policy "plan_settings_public_read" on public.plan_settings
  for select to anon, authenticated using (true);

drop policy if exists "plan_limits_public_read" on public.plan_limits;
create policy "plan_limits_public_read" on public.plan_limits
  for select to anon, authenticated using (true);

drop policy if exists "usage_action_costs_public_read" on public.usage_action_costs;
create policy "usage_action_costs_public_read" on public.usage_action_costs
  for select to anon, authenticated using (true);

-- Plan state and the ledger stay behind the app: every read and write goes
-- through an authenticated route or an RPC, so no client grant exists.
alter table public.user_plans enable row level security;
alter table public.usage_events enable row level security;
alter table public.plan_activations enable row level security;

revoke all on public.user_plans from anon, authenticated;
revoke all on public.usage_events from anon, authenticated;
revoke all on public.plan_activations from anon, authenticated;

grant all on public.user_plans to service_role;
grant all on public.usage_events to service_role;
grant all on public.plan_activations to service_role;

drop policy if exists "user_plans_service_role" on public.user_plans;
create policy "user_plans_service_role" on public.user_plans
  for all to service_role using (true) with check (true);

drop policy if exists "usage_events_service_role" on public.usage_events;
create policy "usage_events_service_role" on public.usage_events
  for all to service_role using (true) with check (true);

drop policy if exists "plan_activations_service_role" on public.plan_activations;
create policy "plan_activations_service_role" on public.plan_activations
  for all to service_role using (true) with check (true);

-- ------------------------------------------------------------
-- Window and allowance helpers
-- ------------------------------------------------------------

-- The plan a user is effectively on right now, and the floor of their
-- rolling window. Three things raise that floor:
--
--   * now() - window_days, the rolling part;
--   * window_reset_at, set by an activation (an upgrade starts from zero);
--   * expires_at, when a pro plan has lapsed (expiry resets the window too,
--     so a heavy subscriber is not blocked for a month by usage their
--     payment already covered).
--
-- Computing it instead of writing a cron row means no server job and no
-- race between "it expired" and "it was reset".
create or replace function private.plan_window(p_user_id uuid)
returns table (plan text, expires_at timestamptz, window_start timestamptz)
language sql
stable
security definer
set search_path = 'public'
as $$
  with settings as (
    select window_days from public.plan_settings where id
  ),
  state as (
    select
      case
        when up.plan = 'pro' and up.expires_at is not null and up.expires_at > now() then 'pro'
        else 'free'
      end as plan,
      up.expires_at,
      up.window_reset_at
    from (select 1) as one
    left join public.user_plans up on up.user_id = p_user_id
  )
  select
    state.plan,
    state.expires_at,
    greatest(
      now() - make_interval(days => settings.window_days),
      coalesce(state.window_reset_at, '-infinity'::timestamptz),
      case
        when state.plan = 'free'
          and state.expires_at is not null
          and state.expires_at <= now()
          then state.expires_at
        else '-infinity'::timestamptz
      end
    ) as window_start
  from state
  cross join settings
$$;

revoke all on function private.plan_window(uuid) from public;
revoke all on function private.plan_window(uuid) from anon;
revoke all on function private.plan_window(uuid) from authenticated;

-- ------------------------------------------------------------
-- Spending
-- ------------------------------------------------------------

-- Spend one metered action for a signed-in user. Atomic: the advisory lock
-- serialises concurrent callers for the same user, so two requests cannot
-- both read the same balance and overrun the cap.
--
-- The result is the whole state, not a boolean: the caller needs the
-- remaining balance to answer a refusal with the upgrade nudge, and the
-- account card needs it on the happy path anyway.
create or replace function public.spend_credits(p_user_id uuid, p_action_key text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_settings public.plan_settings;
  v_cost integer;
  v_window record;
  v_cap integer;
  v_spent integer;
  v_admin boolean;
  v_event_id uuid;
begin
  select * into v_settings from public.plan_settings where id;

  select cost into v_cost
  from public.usage_action_costs
  where action_key = p_action_key;

  if v_cost is null then
    raise exception 'unknown usage action: %', p_action_key using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select * into v_window from private.plan_window(p_user_id);
  v_cap := case when v_window.plan = 'pro' then v_settings.pro_credits else v_settings.free_credits end;

  select exists (
    select 1 from public.users u where u.id = p_user_id and u.is_admin
  ) into v_admin;

  if v_admin then
    return jsonb_build_object(
      'allowed', true,
      'unlimited', true,
      'plan', v_window.plan,
      'cap', v_cap,
      'spent', 0,
      'remaining', v_cap,
      'cost', v_cost,
      'eventId', null,
      'windowDays', v_settings.window_days,
      'expiresAt', v_window.expires_at
    );
  end if;

  select coalesce(sum(cost), 0) into v_spent
  from public.usage_events
  where user_id = p_user_id
    and created_at >= v_window.window_start;

  if v_spent + v_cost > v_cap then
    return jsonb_build_object(
      'allowed', false,
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

  insert into public.usage_events (user_id, action_key, cost)
  values (p_user_id, p_action_key, v_cost)
  returning id into v_event_id;

  return jsonb_build_object(
    'allowed', true,
    'unlimited', false,
    'plan', v_window.plan,
    'cap', v_cap,
    'spent', v_spent + v_cost,
    'remaining', v_cap - v_spent - v_cost,
    'cost', v_cost,
    'eventId', v_event_id,
    'windowDays', v_settings.window_days,
    'expiresAt', v_window.expires_at
  );
end;
$$;

revoke all on function public.spend_credits(uuid, text) from public;
revoke all on function public.spend_credits(uuid, text) from anon;
revoke all on function public.spend_credits(uuid, text) from authenticated;
grant execute on function public.spend_credits(uuid, text) to service_role;

-- The same allowance, reported without spending. The account card uses it.
create or replace function public.get_usage_state(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = 'public'
as $$
  with settings as (
    select * from public.plan_settings where id
  ),
  window_state as (
    select * from private.plan_window(p_user_id)
  ),
  spent as (
    select coalesce(sum(e.cost), 0) as total
    from public.usage_events e, window_state w
    where e.user_id = p_user_id
      and e.created_at >= w.window_start
  )
  select jsonb_build_object(
    'unlimited', exists (select 1 from public.users u where u.id = p_user_id and u.is_admin),
    'plan', w.plan,
    'cap', case when w.plan = 'pro' then s.pro_credits else s.free_credits end,
    'spent', case
      when exists (select 1 from public.users u where u.id = p_user_id and u.is_admin) then 0
      else (select total from spent)
    end,
    'windowDays', s.window_days,
    'expiresAt', w.expires_at
  )
  from window_state w
  cross join settings s
$$;

revoke all on function public.get_usage_state(uuid) from public;
revoke all on function public.get_usage_state(uuid) from anon;
revoke all on function public.get_usage_state(uuid) from authenticated;
grant execute on function public.get_usage_state(uuid) to service_role;

-- A visitor has no ledger, so the subject is a salted IP hash the app
-- computes. The window is a rolling 24 hours, not a calendar day: the same
-- shape as the signed-in window, so there is one idea to explain.
create or replace function public.spend_anonymous_credits(p_ip_hash text, p_action_key text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_settings public.plan_settings;
  v_cost integer;
  v_cap integer;
  v_spent integer;
  v_event_id uuid;
begin
  if p_ip_hash is null or btrim(p_ip_hash) = '' then
    raise exception 'a hashed visitor subject is required' using errcode = '22023';
  end if;

  select * into v_settings from public.plan_settings where id;

  select cost into v_cost
  from public.usage_action_costs
  where action_key = p_action_key;

  if v_cost is null then
    raise exception 'unknown usage action: %', p_action_key using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 1));

  v_cap := v_settings.anonymous_daily_credits;

  select coalesce(sum(cost), 0) into v_spent
  from public.usage_events
  where ip_hash = p_ip_hash
    and created_at >= now() - interval '1 day';

  if v_spent + v_cost > v_cap then
    return jsonb_build_object(
      'allowed', false,
      'cap', v_cap,
      'spent', v_spent,
      'remaining', greatest(v_cap - v_spent, 0),
      'cost', v_cost,
      'eventId', null,
      'windowHours', 24
    );
  end if;

  insert into public.usage_events (ip_hash, action_key, cost)
  values (p_ip_hash, p_action_key, v_cost)
  returning id into v_event_id;

  return jsonb_build_object(
    'allowed', true,
    'cap', v_cap,
    'spent', v_spent + v_cost,
    'remaining', v_cap - v_spent - v_cost,
    'cost', v_cost,
    'eventId', v_event_id,
    'windowHours', 24
  );
end;
$$;

revoke all on function public.spend_anonymous_credits(text, text) from public;
revoke all on function public.spend_anonymous_credits(text, text) from anon;
revoke all on function public.spend_anonymous_credits(text, text) from authenticated;
grant execute on function public.spend_anonymous_credits(text, text) to service_role;

-- A spend is a reservation: it happens before the action runs, so an action
-- that then fails must give the credit back. The refund is scoped to the
-- subject that spent it and is idempotent — deleting an event that is already
-- gone reports false rather than raising.
create or replace function public.refund_credits(p_user_id uuid, p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  delete from public.usage_events
  where id = p_event_id
    and user_id = p_user_id;
  return found;
end;
$$;

revoke all on function public.refund_credits(uuid, uuid) from public;
revoke all on function public.refund_credits(uuid, uuid) from anon;
revoke all on function public.refund_credits(uuid, uuid) from authenticated;
grant execute on function public.refund_credits(uuid, uuid) to service_role;

create or replace function public.refund_anonymous_credits(p_ip_hash text, p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  delete from public.usage_events
  where id = p_event_id
    and ip_hash = p_ip_hash;
  return found;
end;
$$;

revoke all on function public.refund_anonymous_credits(text, uuid) from public;
revoke all on function public.refund_anonymous_credits(text, uuid) from anon;
revoke all on function public.refund_anonymous_credits(text, uuid) from authenticated;
grant execute on function public.refund_anonymous_credits(text, uuid) to service_role;

-- ------------------------------------------------------------
-- Activation
-- ------------------------------------------------------------

-- An operator's 30-day grant. A renewal extends the current expiry rather
-- than truncating it, and every activation resets the usage window (the
-- approved "upgrade starts from zero" rule). The audit row is written in
-- the same transaction as the plan, so they cannot disagree.
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

  insert into public.user_plans (user_id, plan, expires_at, window_reset_at, updated_at, updated_by)
  values (p_user_id, 'pro', v_expiry, now(), now(), p_activated_by)
  on conflict (user_id) do update
    set plan = 'pro',
        expires_at = excluded.expires_at,
        window_reset_at = now(),
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
-- Admin Console list
-- ------------------------------------------------------------

-- One page of users with their effective plan, window spend and cap. Read
-- by the Admin Console's plans page; the aggregate runs over the index on
-- (user_id, created_at), so it stays a per-row lookup for a page of users.
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
  v_settings public.plan_settings;
  v_total integer;
  v_users jsonb;
begin
  select * into v_settings from public.plan_settings where id;

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
      w.plan,
      w.expires_at,
      w.window_start
    from matched m
    cross join lateral private.plan_window(m.id) w
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
      case when r.plan = 'pro' then v_settings.pro_credits else v_settings.free_credits end as cap,
      coalesce((
        select sum(e.cost)
        from public.usage_events e
        where e.user_id = r.id
          and e.created_at >= r.window_start
      ), 0) as spent,
      (select count(*) from matched) as total
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
          'cap', e.cap,
          'spent', e.spent,
          'remaining', greatest(e.cap - e.spent, 0),
          'unlimited', e.is_admin
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
    'windowDays', v_settings.window_days,
    'users', v_users
  );
end;
$$;

revoke all on function public.list_user_usage(text, integer, integer) from public;
revoke all on function public.list_user_usage(text, integer, integer) from anon;
revoke all on function public.list_user_usage(text, integer, integer) from authenticated;
grant execute on function public.list_user_usage(text, integer, integer) to service_role;

comment on table public.plan_settings is
  'Single row: plan price, duration, rolling window, credit pools and the anonymous daily allowance (ADR-0075).';
comment on table public.plan_limits is
  'Standing owned-item caps per product, per plan. Distinct from the rolling credit ledger (ADR-0075).';
comment on table public.usage_action_costs is
  'Credit cost of one metered action. Reads are deliberately absent (ADR-0075).';
comment on table public.user_plans is
  'Current plan per user. Absent row means free; expiry is derived on read, never by a cron.';
comment on table public.usage_events is
  'Rolling spend ledger. Exactly one subject: user_id or a salted ip_hash (ADR-0075).';
comment on table public.plan_activations is
  'Operator record of a manual plan activation; no money moves through the database (ADR-0006).';
