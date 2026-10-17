-- ============================================================
-- Last-write-wins guard for replayed create upserts
--
-- ADR-0029 gives every owned write an idempotent upsert keyed on
-- (user_id, client_id); ADR-0033 resolves conflicts by last-write-wins on the
-- client-supplied `updated_at`. The update and delete paths already apply that
-- guard, but every create path upserted unconditionally. Because the Sync
-- Engine drops an Outbox entry only on a successful response
-- (frontend/shared/local-store/sync-engine.ts), a create whose response was
-- lost is retained and replayed: if another device edited the row meanwhile,
-- the replay wrote the original columns and the older `updated_at` back,
-- silently discarding the newer edit.
--
-- PostgREST's `.upsert()` cannot express a conflict predicate, so each create
-- path gets a small `SECURITY INVOKER` SQL function doing
--
--   insert ... on conflict (user_id, client_id) do update set ...
--     where <table>.updated_at <= excluded.updated_at
--   returning *;
--
-- A conflict that loses the LWW comparison returns zero rows, which the
-- repository reads as "no-op success" and resolves by re-reading the winning
-- row. The functions run with the caller's privileges, so the existing
-- own-row RLS is unchanged. The `touch_server_updated_at` clamp
-- (20261011160000) still applies to SpendTrack on insert and update.
--
-- `upsert_short_link` is called through the service-role client the LinkSnap
-- repository already uses (the hash and owner must never leave the server), so
-- its SECURITY INVOKER body bypasses RLS exactly like the old `.upsert()` did.
--
-- Rollback: drop the five functions.
--   drop function public.upsert_habit(uuid, text, text, boolean, uuid, integer,
--     text, time, uuid, timestamptz);
--   drop function public.upsert_expense(uuid, uuid, numeric, uuid, date, text,
--     text, uuid, timestamptz);
--   drop function public.upsert_recurring_expense(uuid, uuid, numeric, uuid,
--     text, integer, text, boolean, uuid, timestamptz);
--   drop function public.upsert_category(uuid, uuid, text, text, uuid,
--     timestamptz);
--   drop function public.upsert_short_link(text, text, uuid, timestamptz,
--     timestamptz, boolean, timestamptz, text, uuid, timestamptz);
-- ============================================================

create or replace function public.upsert_habit(
  p_id uuid,
  p_name text,
  p_frequency text,
  p_archived boolean,
  p_user_id uuid,
  p_target integer,
  p_target_period text,
  p_reminder_time time,
  p_client_id uuid,
  p_updated_at timestamptz
)
returns setof public.habits
language sql
security invoker
set search_path = public
as $$
  insert into public.habits as h
    (id, name, frequency, archived, user_id, target, target_period, reminder_time, client_id, updated_at)
  values
    (p_id, p_name, p_frequency, p_archived, p_user_id, p_target, p_target_period, p_reminder_time, p_client_id, p_updated_at)
  on conflict (user_id, client_id) do update set
    name = excluded.name,
    frequency = excluded.frequency,
    archived = excluded.archived,
    target = excluded.target,
    target_period = excluded.target_period,
    reminder_time = excluded.reminder_time,
    updated_at = excluded.updated_at
  where h.updated_at <= excluded.updated_at
  returning *;
$$;

create or replace function public.upsert_expense(
  p_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_category_id uuid,
  p_date date,
  p_description text,
  p_currency text,
  p_client_id uuid,
  p_updated_at timestamptz
)
returns setof public.expenses
language sql
security invoker
set search_path = public
as $$
  insert into public.expenses as e
    (id, user_id, amount, category_id, date, description, currency, client_id, updated_at)
  values
    (p_id, p_user_id, p_amount, p_category_id, p_date, p_description, p_currency, p_client_id, p_updated_at)
  on conflict (user_id, client_id) do update set
    amount = excluded.amount,
    category_id = excluded.category_id,
    date = excluded.date,
    description = excluded.description,
    currency = excluded.currency,
    updated_at = excluded.updated_at
  where e.updated_at <= excluded.updated_at
  returning *;
$$;

create or replace function public.upsert_recurring_expense(
  p_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_category_id uuid,
  p_description text,
  p_day_of_month integer,
  p_start_month text,
  p_active boolean,
  p_client_id uuid,
  p_updated_at timestamptz
)
returns setof public.recurring_expenses
language sql
security invoker
set search_path = public
as $$
  insert into public.recurring_expenses as r
    (id, user_id, amount, category_id, description, day_of_month, start_month, active, client_id, updated_at)
  values
    (p_id, p_user_id, p_amount, p_category_id, p_description, p_day_of_month, p_start_month, p_active, p_client_id, p_updated_at)
  on conflict (user_id, client_id) do update set
    amount = excluded.amount,
    category_id = excluded.category_id,
    description = excluded.description,
    day_of_month = excluded.day_of_month,
    start_month = excluded.start_month,
    active = excluded.active,
    updated_at = excluded.updated_at
  where r.updated_at <= excluded.updated_at
  returning *;
$$;

create or replace function public.upsert_category(
  p_id uuid,
  p_user_id uuid,
  p_name text,
  p_color_hex text,
  p_client_id uuid,
  p_updated_at timestamptz
)
returns setof public.categories
language sql
security invoker
set search_path = public
as $$
  insert into public.categories as c
    (id, user_id, name, color_hex, client_id, updated_at)
  values
    (p_id, p_user_id, p_name, p_color_hex, p_client_id, p_updated_at)
  on conflict (user_id, client_id) do update set
    name = excluded.name,
    color_hex = excluded.color_hex,
    updated_at = excluded.updated_at
  where c.updated_at <= excluded.updated_at
  returning *;
$$;

create or replace function public.upsert_short_link(
  p_code text,
  p_original_url text,
  p_user_id uuid,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_is_blocked boolean,
  p_expires_at timestamptz,
  p_password_hash text,
  p_client_id uuid,
  p_deleted_at timestamptz
)
returns setof public.short_links
language sql
security invoker
set search_path = public
as $$
  insert into public.short_links as s
    (code, original_url, user_id, created_at, updated_at, is_blocked, expires_at, password_hash, client_id, deleted_at)
  values
    (p_code, p_original_url, p_user_id, p_created_at, p_updated_at, p_is_blocked, p_expires_at, p_password_hash, p_client_id, p_deleted_at)
  on conflict (user_id, client_id) do update set
    code = excluded.code,
    original_url = excluded.original_url,
    is_blocked = excluded.is_blocked,
    expires_at = excluded.expires_at,
    password_hash = excluded.password_hash,
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at
  where s.updated_at <= excluded.updated_at
  returning *;
$$;
