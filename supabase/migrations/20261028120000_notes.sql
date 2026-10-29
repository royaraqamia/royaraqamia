-- ============================================================
-- Notes: the product's one owned table (ADR-0092)
--
-- Notes works like every other owned product before it (ADR-0027 … ADR-0029):
-- the device is the source of truth, a guest can write without an account, and
-- this table exists so a signed-in writer finds the same notes on a second
-- device. Every row is single-owner, so the sync is deliberately dumb — an
-- idempotent upsert keyed on the client-minted id, a tombstone for a removal,
-- last-write-wins on the client's `updated_at` — and a first sign-in Claims what
-- the device already holds rather than starting over.
--
-- `server_updated_at` is the pull cursor, maintained (and clock-skew clamped) by
-- the shared `touch_server_updated_at` trigger, so a device whose clock runs
-- ahead cannot win every conflict forever. Both the incremental pull and the
-- Realtime hint read the same `(user_id, server_updated_at)` index.
--
-- The cap is a standing owned-item cap (ADR-0075): `notes` is one row of
-- `plan_limits`, and the trigger below is the enforcement point — the Node
-- pre-check is only the fast refusal with the upgrade nudge. A row that was
-- already live holds its slot, so an account that lapsed back to Free keeps its
-- data and simply cannot add more.
--
-- Additive: one new table, one cap row, one function replacement and one
-- trigger. Every statement is written to re-run harmlessly.
--
-- Rollback:
--   drop trigger if exists enforce_plan_cap on public.notes;
--   drop table if exists public.notes;
--   delete from public.plan_limits where key = 'notes';
--   -- and `private.owned_item_count` goes back to its
--   -- 20261023140000 body (without the `notes` case).
-- ============================================================

create table if not exists public.notes (
  -- The device mints this (UUIDv7) and it is the row's identity on both sides,
  -- so a replayed write is an upsert rather than a second note. The default is
  -- for rows written outside the API — the Realtime probe script, for one.
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  -- Records the last writer (ADR-0029). The identity above is already the
  -- client-minted one, so this is traceability rather than a second key.
  client_id         uuid,
  title             text not null default '' check (char_length(title) <= 200),
  -- Markdown source, never HTML: the list renders a plain-text projection of it.
  body              text not null default '' check (char_length(body) <= 100000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

-- One index serves both readers: the incremental pull pages on
-- `server_updated_at` for a user, and the Realtime hint filters on the same user.
create index if not exists idx_notes_server_updated_at
  on public.notes (user_id, server_updated_at);

-- The list's own read: a user's live notes, newest edit first.
create index if not exists idx_notes_updated_at
  on public.notes (user_id, updated_at desc)
  where deleted_at is null;

alter table public.notes enable row level security;

drop policy if exists "Users can view their own notes" on public.notes;
create policy "Users can view their own notes"
  on public.notes for select
  to authenticated
  using ( (select auth.uid()) = user_id );

drop policy if exists "Users can insert their own notes" on public.notes;
create policy "Users can insert their own notes"
  on public.notes for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

drop policy if exists "Users can update their own notes" on public.notes;
create policy "Users can update their own notes"
  on public.notes for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

drop policy if exists "Users can delete their own notes" on public.notes;
create policy "Users can delete their own notes"
  on public.notes for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

grant select, insert, update, delete on public.notes to authenticated;

create or replace trigger trg_notes_server_updated_at
  before insert or update on public.notes
  for each row execute function public.touch_server_updated_at();

-- ------------------------------------------------------------
-- The standing cap
-- ------------------------------------------------------------

insert into public.plan_limits (key, label_ar, free_cap, pro_cap, sort_order) values
  ('notes', 'الملاحظات', 100, 10000, 115)
on conflict (key) do nothing;

-- `private.owned_item_count` is one switch over every capped item, so adding an
-- item means replacing the whole function. The body is the 20261023140000 one
-- plus the `notes` case; the comment and the tombstone rule are unchanged.
create or replace function private.owned_item_count(p_user_id uuid, p_item text)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_count integer;
begin
  case p_item
    when 'habits' then
      select count(*)::integer into v_count
        from public.habits
       where user_id = p_user_id and deleted_at is null;
    when 'expenses' then
      select count(*)::integer into v_count
        from public.expenses
       where user_id = p_user_id and deleted_at is null;
    when 'expense_categories' then
      select count(*)::integer into v_count
        from public.categories
       where user_id = p_user_id and deleted_at is null;
    when 'budgets' then
      select count(*)::integer into v_count
        from public.budgets
       where user_id = p_user_id and deleted_at is null;
    when 'short_links' then
      select count(*)::integer into v_count
        from public.short_links
       where user_id = p_user_id and deleted_at is null;
    when 'community_drafts' then
      select count(*)::integer into v_count
        from public.posts
       where author_id = p_user_id
         and deleted_at is null
         and status in ('draft', 'scheduled');
    when 'community_published' then
      select count(*)::integer into v_count
        from public.posts
       where author_id = p_user_id and deleted_at is null and status = 'published';
    when 'community_tags' then
      -- No tombstone column: the row is the slot.
      select count(*)::integer into v_count
        from public.community_tags
       where user_id = p_user_id;
    when 'community_categories' then
      select count(*)::integer into v_count
        from public.community_categories
       where user_id = p_user_id;
    when 'quran_bookmarks' then
      select count(*)::integer into v_count
        from public.quran_bookmarks
       where user_id = p_user_id and deleted_at is null;
    when 'notes' then
      select count(*)::integer into v_count
        from public.notes
       where user_id = p_user_id and deleted_at is null;
    else
      raise exception 'unknown owned item: %', p_item using errcode = '22023';
  end case;

  return v_count;
end;
$$;

revoke all on function private.owned_item_count(uuid, text) from public, anon, authenticated;

-- The shared trigger (20261023140000) reads `tg_argv[0]` as the item key and
-- `tg_argv[1]` as the owner column, so Notes needs only its own trigger.
drop trigger if exists enforce_plan_cap on public.notes;
create trigger enforce_plan_cap
  before insert or update on public.notes
  for each row execute function private.enforce_owned_item_cap('notes', 'user_id');

comment on table public.notes is
  'A writer''s own notes (ADR-0092): client-minted id, Markdown body, tombstones, LWW on updated_at.';
