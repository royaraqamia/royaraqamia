-- ============================================================
-- SpendTrack incremental sync watermark + tombstone retention
--
-- The on-open reconcile shipped as a full snapshot (ADR-0028). At scale that
-- re-downloads every row — and every tombstone — on every open, and the
-- tombstones accumulate without bound.
--
-- `updated_at` cannot be the cursor: it is the *client's* logical write time
-- for LWW (ADR-0029), so a lagging device clock could write a row "in the past"
-- and a `> cursor` page would skip it forever. `server_updated_at` is a
-- dedicated, monotonic server clock set by a trigger on insert/update — safe to
-- page on regardless of client clocks.
--
-- A daily pg_cron job prunes tombstones past the retention window; a device
-- offline longer than that window will not learn of very old deletes (the
-- standard retention trade-off).
--
-- Rollback:
--   select cron.unschedule('spendtrack-prune-tombstones');
--   drop function if exists public.prune_spendtrack_tombstones();
--   drop function if exists public.touch_server_updated_at();
--   drop trigger if exists trg_<table>_server_updated_at on public.<table>;
--   alter table public.<table> drop column server_updated_at;
-- ============================================================

alter table public.categories
  add column if not exists server_updated_at timestamptz not null default now();
alter table public.expenses
  add column if not exists server_updated_at timestamptz not null default now();
alter table public.expense_splits
  add column if not exists server_updated_at timestamptz not null default now();
alter table public.budgets
  add column if not exists server_updated_at timestamptz not null default now();
alter table public.recurring_expenses
  add column if not exists server_updated_at timestamptz not null default now();

create or replace function public.touch_server_updated_at()
returns trigger
language plpgsql
set search_path = 'public'
as $fn$
begin
  new.server_updated_at = now();
  return new;
end;
$fn$;

create or replace trigger trg_categories_server_updated_at
  before insert or update on public.categories
  for each row execute function public.touch_server_updated_at();
create or replace trigger trg_expenses_server_updated_at
  before insert or update on public.expenses
  for each row execute function public.touch_server_updated_at();
create or replace trigger trg_expense_splits_server_updated_at
  before insert or update on public.expense_splits
  for each row execute function public.touch_server_updated_at();
create or replace trigger trg_budgets_server_updated_at
  before insert or update on public.budgets
  for each row execute function public.touch_server_updated_at();
create or replace trigger trg_recurring_expenses_server_updated_at
  before insert or update on public.recurring_expenses
  for each row execute function public.touch_server_updated_at();

create index if not exists categories_server_updated_at_idx
  on public.categories (user_id, server_updated_at);
create index if not exists expenses_server_updated_at_idx
  on public.expenses (user_id, server_updated_at);
create index if not exists expense_splits_server_updated_at_idx
  on public.expense_splits (expense_id, server_updated_at);
create index if not exists budgets_server_updated_at_idx
  on public.budgets (user_id, server_updated_at);
create index if not exists recurring_expenses_server_updated_at_idx
  on public.recurring_expenses (user_id, server_updated_at);

-- Retention: prune tombstones past the window so the snapshot stops growing.
create or replace function public.prune_spendtrack_tombstones()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  delete from public.expenses
    where deleted_at is not null and deleted_at < now() - interval '90 days';
  delete from public.expense_splits
    where deleted_at is not null and deleted_at < now() - interval '90 days';
  delete from public.budgets
    where deleted_at is not null and deleted_at < now() - interval '90 days';
  delete from public.recurring_expenses
    where deleted_at is not null and deleted_at < now() - interval '90 days';
  delete from public.categories
    where deleted_at is not null and deleted_at < now() - interval '90 days';
end;
$fn$;

revoke execute on function public.prune_spendtrack_tombstones()
  from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'spendtrack-prune-tombstones') then
    perform cron.schedule(
      'spendtrack-prune-tombstones',
      '45 3 * * *',
      $$select public.prune_spendtrack_tombstones()$$
    );
  end if;
end;
$do$;
