-- ============================================================
-- The Quran Reader's two owned tables (ADR-0056, P1b)
--
-- Reading needs no account: the reader's place and their marks live in the
-- Local Store, and these tables exist only so a reader who signs in finds them
-- on a second device. Every row is single-owner, so the sync is deliberately
-- dumb — an idempotent write, a tombstone for a removal, last-write-wins on the
-- client's `updated_at` (ADR-0029, ADR-0033) — and a first sign-in Claims what
-- the device already holds rather than starting over.
--
-- Neither table keys its replay on `client_id`, because neither row's identity
-- is a write. Both keys are natural, which is also the shape the client already
-- has in IndexedDB:
--
--   quran_reading_positions   one row per reader           -> (user_id)
--   quran_bookmarks           one row per Ayah per reader  -> (user_id, surah, ayah)
--
-- `client_id` therefore records who wrote last, exactly as it does for
-- `budgets` (backend/repositories/spendtrack/index.ts, `upsertBudget`). The
-- unique index on a Bookmark deliberately covers tombstones: re-marking an Ayah
-- must revive the row that still occupies its key instead of inserting a second
-- one for the same place, which is what the Local Store's own toggle does.
--
-- `server_updated_at` is the pull cursor, and the trigger maintaining it also
-- clamps a clock-skewed write time (20261011150000, 20261011160000): a device
-- whose clock runs ahead must not win every conflict forever. The Quran's rows
-- want both, so they reuse that trigger rather than growing a second one.
--
-- Additive: two new tables, nothing existing is altered. Every statement is
-- written to re-run harmlessly — tables, indexes and triggers are `if not
-- exists`/`create or replace`, and a policy is dropped before it is recreated —
-- so this file can be applied by hand after a failed run without a guard on
-- what is already in place. (It carries a later version than the file it shared
-- a timestamp with, `20261019140000_certificates_recipient_user_ids_gin.sql`,
-- whose apply won that race.)
--
-- Rollback:
--   drop table if exists public.quran_bookmarks;
--   drop table if exists public.quran_reading_positions;
-- ============================================================

create table if not exists public.quran_reading_positions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  surah             smallint not null check (surah between 1 and 114),
  -- 286 is Al-Baqarah, the longest Surah; the Ayah range is a guard against a
  -- replayed write that no Surah's own manifest would accept.
  ayah              smallint not null check (ayah between 1 and 286),
  client_id         uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  -- One place per reader, not one per Surah: the Resume point is the reader's
  -- position in the whole Quran, so the row is reused rather than accumulated.
  unique (user_id)
);

create table if not exists public.quran_bookmarks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  surah             smallint not null check (surah between 1 and 114),
  ayah              smallint not null check (ayah between 1 and 286),
  client_id         uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (user_id, surah, ayah)
);

-- One index per table serves both readers of the table: the incremental pull
-- pages on `server_updated_at` for a user, and the Realtime hint that will
-- trigger that pull filters on the same user.
create index if not exists idx_quran_reading_positions_server_updated_at
  on public.quran_reading_positions (user_id, server_updated_at);
create index if not exists idx_quran_bookmarks_server_updated_at
  on public.quran_bookmarks (user_id, server_updated_at);

alter table public.quran_reading_positions enable row level security;
alter table public.quran_bookmarks enable row level security;

drop policy if exists "Users can view their own reading position"
  on public.quran_reading_positions;
create policy "Users can view their own reading position"
  on public.quran_reading_positions for select
  to authenticated
  using ( (select auth.uid()) = user_id );

drop policy if exists "Users can insert their own reading position"
  on public.quran_reading_positions;
create policy "Users can insert their own reading position"
  on public.quran_reading_positions for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

drop policy if exists "Users can update their own reading position"
  on public.quran_reading_positions;
create policy "Users can update their own reading position"
  on public.quran_reading_positions for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

drop policy if exists "Users can delete their own reading position"
  on public.quran_reading_positions;
create policy "Users can delete their own reading position"
  on public.quran_reading_positions for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

drop policy if exists "Users can view their own bookmarks" on public.quran_bookmarks;
create policy "Users can view their own bookmarks"
  on public.quran_bookmarks for select
  to authenticated
  using ( (select auth.uid()) = user_id );

drop policy if exists "Users can insert their own bookmarks" on public.quran_bookmarks;
create policy "Users can insert their own bookmarks"
  on public.quran_bookmarks for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

drop policy if exists "Users can update their own bookmarks" on public.quran_bookmarks;
create policy "Users can update their own bookmarks"
  on public.quran_bookmarks for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

drop policy if exists "Users can delete their own bookmarks" on public.quran_bookmarks;
create policy "Users can delete their own bookmarks"
  on public.quran_bookmarks for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

grant select, insert, update, delete on public.quran_reading_positions to authenticated;
grant select, insert, update, delete on public.quran_bookmarks to authenticated;

create or replace trigger trg_quran_reading_positions_server_updated_at
  before insert or update on public.quran_reading_positions
  for each row execute function public.touch_server_updated_at();

create or replace trigger trg_quran_bookmarks_server_updated_at
  before insert or update on public.quran_bookmarks
  for each row execute function public.touch_server_updated_at();
