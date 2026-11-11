-- ============================================================
-- The catalogue records who measured a row, and when (#1293)
--
-- `verified_at` is still the store's only publish switch, but it never said who
-- turned it on: a timestamp cannot answer "did a person vouch for this row, or
-- did a machine measure it?". That question matters now that an agent may
-- publish unattended, so every act on a row leaves one append-only event with
-- its actor, the source of whatever it wrote, and the evidence it decided on.
--
-- The log is append-only in the database, not by convention: a trigger refuses
-- `update` and `delete`, so a later run cannot rewrite what an earlier one
-- claimed. `service_role` inserts and reads; an admin reads through
-- `private.is_admin()`, the same predicate every other console table uses.
--
-- `mcp_catalog_latest_verifications` is the Admin Console's read: one row per
-- catalogue row, the most recent verify or withdraw. The console draws that
-- date and actor beside the state, and a derived view keeps that one query from
-- becoming one query per row.
--
-- Additive only. The 40,809-row mirror is untouched: no column on
-- `mcp_catalog_servers` changes, no generated expression is recreated, and
-- `search_text`, its trigger and its partial trigram index stay as they are
-- (#1260, #1262).
--
-- Rollback:
--   drop view if exists public.mcp_catalog_latest_verifications;
--   drop table if exists public.mcp_catalog_verification_events;
--   drop function if exists private.mcp_catalog_events_append_only();
-- ============================================================

create table if not exists public.mcp_catalog_verification_events (
  id bigint generated always as identity primary key,
  -- The row the act was about. `restrict` on purpose: a catalogue row carries
  -- members' connections, and deleting the evidence with it would erase the
  -- only record of why it was published.
  registry_name text not null
    references public.mcp_catalog_servers (registry_name) on delete restrict,
  -- An admin's email, or `agent:mcp-catalog`. Never empty: an event that cannot
  -- name its actor is the state this table exists to make impossible.
  actor text not null check (length(btrim(actor)) > 0),
  -- The act. `skip` belongs here from the start so half 3's work list needs no
  -- second schema change.
  action text not null check (action in ('verify', 'withdraw', 'mark', 'copy', 'skip')),
  -- Where the written value came from. `machine` is a measurement, `none` is a
  -- write whose provenance is the person who made it.
  source text not null check (
    source in ('logo_uri', 'brand', 'simple_icons', 'repo', 'registry', 'machine', 'none')
  ),
  -- The field, the source text or URL, the checks, and a skip's reason.
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- The console asks for the newest event of a page of rows, and the wait list
-- (half 3) asks for the newest skip. One index answers both.
create index if not exists idx_mcp_catalog_verification_events_recent
  on public.mcp_catalog_verification_events (registry_name, created_at desc);

alter table public.mcp_catalog_verification_events enable row level security;

-- The admin console reads the log; an anonymous caller never does. The write
-- path is the server's own client, which bypasses RLS but not privileges.
revoke all on public.mcp_catalog_verification_events from anon, authenticated;
grant select on public.mcp_catalog_verification_events to authenticated;
grant all on public.mcp_catalog_verification_events to service_role;

create policy "Admins read the catalogue's verification events"
  on public.mcp_catalog_verification_events for select
  to authenticated
  using ((select private.is_admin()));

-- Append-only, enforced: a correction is a new event, never an edit.
create or replace function private.mcp_catalog_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'mcp_catalog_verification_events is append-only';
end;
$$;

revoke all on function private.mcp_catalog_events_append_only() from public, anon, authenticated;

drop trigger if exists mcp_catalog_events_append_only
  on public.mcp_catalog_verification_events;
create trigger mcp_catalog_events_append_only
  before update or delete on public.mcp_catalog_verification_events
  for each row execute function private.mcp_catalog_events_append_only();

-- One row per catalogue row: the newest verify or withdraw, which is the pair
-- the console draws beside the state. A mark or copy event is not a state
-- change, so it does not displace the answer.
create or replace view public.mcp_catalog_latest_verifications
with (security_invoker = true) as
select distinct on (registry_name)
  registry_name,
  actor,
  action,
  source,
  evidence,
  created_at
from public.mcp_catalog_verification_events
where action in ('verify', 'withdraw')
order by registry_name, created_at desc;

revoke all on public.mcp_catalog_latest_verifications from anon;
grant select on public.mcp_catalog_latest_verifications to authenticated;
grant select on public.mcp_catalog_latest_verifications to service_role;
