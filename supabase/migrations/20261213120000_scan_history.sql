-- ============================================================
-- The scan history (#1430, ADR-0205)
--
-- The Scanner used to keep nothing (ADR-0034). It now keeps a summary: which
-- kind of code was read, in which format, for which service, and when. The
-- payload itself is not here and has no column to be: the browser builds the
-- summary, and the route's schema refuses a fourth field, so a Wi-Fi password or
-- an OTP seed never leaves the device.
--
-- Four decisions are enforced by this file rather than by the service that
-- happens to write it:
--
-- 1. **The member is the row's whole audience.** RLS is owner-only in both
--    directions - read and delete - and there is deliberately no admin policy.
--    The writer is the definer function below, so `insert`/`update` are not
--    granted to `authenticated` at all: the only door into the table is the one
--    that names `auth.uid()` itself.
--
-- 2. **One code is one row.** The unique index below covers the columns that
--    make two rows the same scan (member, kind, label), with `nulls not distinct`
--    so the label-less kinds - a location, a plain text - collapse too.
--    `seen_count` and `last_seen_at` carry the repetition, which is what a
--    member looking for "that code again" wants; two rows of the same code is
--    a log, not a history.
--
-- 3. **A row ages out.** `sweep_scan_history` deletes past 90 days from the last
--    read, and past 200 kept rows per member, on the same pg_cron pattern the
--    news digests use. A history is a thing the member returns to for a while,
--    not an archive of what they pointed a camera at.
--
-- 4. **The account deletion is a cascade.** `user_id` references `auth.users`,
--    so the rows go with the account. The member's own clear is a `delete`
--    scoped by `user_id` (and by RLS), not a soft delete: a summary with no
--    content is a row with no reason to exist.
--
-- Rollback:
--   select cron.unschedule('scan-history-sweep');
--   drop function if exists public.sweep_scan_history();
--   drop function if exists public.record_scan_history(text, text, text);
--   drop table if exists public.scan_history;
-- ============================================================

create extension if not exists pg_cron;

create table if not exists public.scan_history (
  id           uuid primary key default gen_random_uuid(),
  -- The member whose scan this is. `auth.users`, not `public.users`: deleting the
  -- account has to reach these rows without depending on a profile row's cascade.
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- The Scanner's own vocabulary (`shared/contracts/scan.ts`).
  kind         text not null,
  -- The detector's name, folded to `[a-z0-9_]` before it travels.
  format       text not null,
  -- What identifies the code without being its secret: a host, a domain, a
  -- network name, an issuer, a masked number. Null for a location or a text.
  label        text,
  -- First read, and the last. `created_at` is what "when did I first scan this"
  -- means; the list orders by the other one.
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count   integer not null default 1,
  constraint scan_history_kind check (
    kind in ('link', 'email', 'phone', 'sms', 'wifi', 'contact', 'location', 'otp', 'text')
  ),
  constraint scan_history_format check (format ~ '^[a-z0-9_]{1,32}$'),
  constraint scan_history_label check (
    label is null or length(btrim(label)) between 1 and 120
  ),
  constraint scan_history_seen_count check (seen_count >= 1)
);

comment on table public.scan_history is
  'A summary of the codes the member scanned: kind, format, an identifying label and when. The payload is never stored (ADR-0205).';
comment on column public.scan_history.label is
  'The part of the payload that identifies the code without being its secret: a host, a domain, an SSID, an issuer, a masked number. Null when nothing safe identifies it.';
comment on column public.scan_history.seen_count is
  'How many times this code was read. One row per code, not one row per read.';
comment on column public.scan_history.last_seen_at is
  'The last read. The list orders by it and the sweep measures the 90 days from it.';

-- One code is one row: the same member, kind and label cannot repeat. `nulls not
-- distinct` is what makes the label-less kinds compare equal to themselves.
create unique index if not exists uq_scan_history_code
  on public.scan_history (user_id, kind, label)
  nulls not distinct;

-- What the list reads: one member's rows, newest first.
create index if not exists idx_scan_history_member
  on public.scan_history (user_id, last_seen_at desc);

-- What the sweep scans, and the foreign key's own index (#1086): an account
-- deletion has to find a member's rows without reading the whole table.
create index if not exists idx_scan_history_last_seen
  on public.scan_history (last_seen_at);

alter table public.scan_history enable row level security;

drop policy if exists "Members read their own scans" on public.scan_history;
create policy "Members read their own scans"
  on public.scan_history for select
  to authenticated
  using ( user_id = (select auth.uid()) );

drop policy if exists "Members clear their own scans" on public.scan_history;
create policy "Members clear their own scans"
  on public.scan_history for delete
  to authenticated
  using ( user_id = (select auth.uid()) );

-- Someone signed out reads nothing, and no role reaches the table by default.
revoke all on public.scan_history from anon, authenticated;
grant select, delete on public.scan_history to authenticated;
-- The assistant's tool reads through the member's own client; the sweep and the
-- route run on the service role. It bypasses RLS, not privileges.
grant all on public.scan_history to service_role;

-- ============================================================
-- The one writer
--
-- Insert-or-count in one statement, which PostgREST's upsert cannot express
-- (`seen_count + 1`). `security definer` is what lets `authenticated` write
-- without an insert or update grant, so the table's only write path is the one
-- below - and it re-reads `auth.uid()` rather than accepting a user id.
-- ============================================================

create or replace function public.record_scan_history(
  p_kind text,
  p_format text,
  p_label text
)
returns public.scan_history
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_user uuid := auth.uid();
  v_row  public.scan_history;
begin
  if v_user is null then
    raise exception 'forbidden';
  end if;

  insert into public.scan_history (user_id, kind, format, label)
  values (v_user, p_kind, p_format, nullif(btrim(coalesce(p_label, '')), ''))
  on conflict (user_id, kind, label) do update
    set last_seen_at = now(),
        seen_count   = public.scan_history.seen_count + 1,
        format       = excluded.format
  returning * into v_row;

  return v_row;
end;
$fn$;

revoke all on function public.record_scan_history(text, text, text) from public, anon;
grant execute on function public.record_scan_history(text, text, text)
  to authenticated, service_role;

-- ============================================================
-- Retention: 90 days from the last read, then the two hundredth row
--
-- Runs at 04:20 UTC, after the news digests' sweep, so a row written in the
-- evening is never pruned in the same hour it was written.
-- ============================================================

create or replace function public.sweep_scan_history()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  delete from public.scan_history
  where last_seen_at < now() - interval '90 days';

  delete from public.scan_history h
  using (
    select id,
           row_number() over (partition by user_id order by last_seen_at desc, id) as rn
    from public.scan_history
  ) ranked
  where h.id = ranked.id
    and ranked.rn > 200;
end;
$fn$;

revoke execute on function public.sweep_scan_history()
  from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'scan-history-sweep') then
    perform cron.schedule(
      'scan-history-sweep',
      '20 4 * * *',
      $$select public.sweep_scan_history()$$
    );
  end if;
end;
$do$;
