-- ============================================================
-- Last-write-wins for replayed create upserts (ADR-0029 / ADR-0033, #287)
--
-- Every owned create path upserts unconditionally on (user_id, client_id).
-- A create whose response was lost stays in the Outbox and is replayed; if
-- another device has edited the row since, the replay writes the original
-- columns and the older `updated_at` back, silently discarding the newer
-- edit — the lost-update mode the ADRs set out to prevent. PostgREST upserts
-- cannot express a conflict predicate, so each create path gets a small
-- SECURITY INVOKER function doing:
--
--   insert ... on conflict (user_id, client_id) do update set ...
--   where excluded.updated_at >= <table>.updated_at
--
-- When the incoming write is older than the stored row the DO UPDATE matches
-- nothing, so no row is returned: the caller keeps the stored row (and, for
-- SpendTrack, leaves its `expense_splits` alone) and still reports success.
-- An equal-or-newer write upserts idempotently, one row per (user_id, client_id).
--
-- `deleted_at` is deliberately not written: a create replay never resurrects a
-- tombstone, matching the unconditional upsert it replaces. The future-skew
-- clamp (`touch_server_updated_at`, 20261011160000) still runs BEFORE INSERT
-- on the SpendTrack tables, so `excluded.updated_at` is already clamped.
--
-- SECURITY INVOKER: RLS of the calling role applies exactly as it does to the
-- direct upsert. No privilege escalation, no advisor finding.
--
-- Rollback:
--   drop function if exists public.upsert_habit_lww(jsonb);
--   drop function if exists public.upsert_expense_lww(jsonb);
--   drop function if exists public.upsert_recurring_expense_lww(jsonb);
--   drop function if exists public.upsert_category_lww(jsonb);
--   drop function if exists public.upsert_short_link_lww(jsonb);
-- ============================================================

-- HabitFlow -----------------------------------------------------------------

create or replace function public.upsert_habit_lww(p_row jsonb)
returns setof public.habits
language sql
security invoker
set search_path = 'public'
as $fn$
  insert into public.habits as h (
    id,
    name,
    frequency,
    archived,
    user_id,
    target,
    target_period,
    reminder_time,
    client_id,
    updated_at
  )
  select
    r.id,
    r.name,
    r.frequency,
    r.archived,
    r.user_id,
    r.target,
    r.target_period,
    r.reminder_time,
    r.client_id,
    r.updated_at
  from jsonb_populate_record(null::public.habits, p_row) as r
  on conflict (user_id, client_id) do update set
    name = excluded.name,
    frequency = excluded.frequency,
    archived = excluded.archived,
    target = excluded.target,
    target_period = excluded.target_period,
    reminder_time = excluded.reminder_time,
    updated_at = excluded.updated_at
  where excluded.updated_at >= h.updated_at
  returning h.*;
$fn$;

-- LinkSnap ------------------------------------------------------------------

create or replace function public.upsert_short_link_lww(p_row jsonb)
returns setof public.short_links
language sql
security invoker
set search_path = 'public'
as $fn$
  insert into public.short_links as s (
    code,
    original_url,
    user_id,
    created_at,
    updated_at,
    is_blocked,
    expires_at,
    password_hash,
    client_id
  )
  select
    r.code,
    r.original_url,
    r.user_id,
    r.created_at,
    r.updated_at,
    r.is_blocked,
    r.expires_at,
    r.password_hash,
    r.client_id
  from jsonb_populate_record(null::public.short_links, p_row) as r
  on conflict (user_id, client_id) do update set
    -- `code` is the primary key and an edit may change it; analytics_events
    -- references it ON UPDATE CASCADE, so the rename re-points click history.
    code = excluded.code,
    original_url = excluded.original_url,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    is_blocked = excluded.is_blocked,
    expires_at = excluded.expires_at,
    password_hash = excluded.password_hash
  where excluded.updated_at >= s.updated_at
  returning s.*;
$fn$;

-- SpendTrack ----------------------------------------------------------------

create or replace function public.upsert_expense_lww(p_row jsonb)
returns setof public.expenses
language sql
security invoker
set search_path = 'public'
as $fn$
  insert into public.expenses as e (
    id,
    user_id,
    amount,
    category_id,
    date,
    description,
    currency,
    client_id,
    updated_at
  )
  select
    r.id,
    r.user_id,
    r.amount,
    r.category_id,
    r.date,
    r.description,
    r.currency,
    r.client_id,
    r.updated_at
  from jsonb_populate_record(null::public.expenses, p_row) as r
  on conflict (user_id, client_id) do update set
    amount = excluded.amount,
    category_id = excluded.category_id,
    date = excluded.date,
    description = excluded.description,
    currency = excluded.currency,
    updated_at = excluded.updated_at
  where excluded.updated_at >= e.updated_at
  returning e.*;
$fn$;

create or replace function public.upsert_recurring_expense_lww(p_row jsonb)
returns setof public.recurring_expenses
language sql
security invoker
set search_path = 'public'
as $fn$
  insert into public.recurring_expenses as r0 (
    id,
    user_id,
    amount,
    category_id,
    description,
    day_of_month,
    start_month,
    client_id,
    updated_at
  )
  select
    r.id,
    r.user_id,
    r.amount,
    r.category_id,
    r.description,
    r.day_of_month,
    r.start_month,
    r.client_id,
    r.updated_at
  from jsonb_populate_record(null::public.recurring_expenses, p_row) as r
  on conflict (user_id, client_id) do update set
    amount = excluded.amount,
    category_id = excluded.category_id,
    description = excluded.description,
    day_of_month = excluded.day_of_month,
    start_month = excluded.start_month,
    updated_at = excluded.updated_at
  where excluded.updated_at >= r0.updated_at
  returning r0.*;
$fn$;

create or replace function public.upsert_category_lww(p_row jsonb)
returns setof public.categories
language sql
security invoker
set search_path = 'public'
as $fn$
  insert into public.categories as c (
    id,
    user_id,
    name,
    color_hex,
    client_id,
    updated_at
  )
  select
    r.id,
    r.user_id,
    r.name,
    r.color_hex,
    r.client_id,
    r.updated_at
  from jsonb_populate_record(null::public.categories, p_row) as r
  on conflict (user_id, client_id) do update set
    name = excluded.name,
    color_hex = excluded.color_hex,
    updated_at = excluded.updated_at
  where excluded.updated_at >= c.updated_at
  returning c.*;
$fn$;
