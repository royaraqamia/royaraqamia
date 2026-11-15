-- ============================================================
-- The facts the assistant remembers (ADR-0182 decisions 2, 5, 6, 7, #1424)
--
-- `trimHistory` keeps the last twenty messages, so on the twenty-first the
-- member reintroduces themselves. A saved fact is the other half of memory: a
-- row the member owns, can read back, edit and delete, and that no turn can
-- invent about somebody else.
--
-- Three things this file decides, and each is enforced here rather than in the
-- service that happens to write it:
--
-- 1. **The member is the row's whole audience.** RLS is owner-only in every
--    direction - read, write, edit, delete - and there is deliberately no admin
--    policy: an administrator reads nobody's memory. The service role keeps its
--    grant because the extraction writer and the account page both run through
--    it, but no product surface reads another member's rows (that is a review
--    rule, not a grant).
--
-- 2. **A duplicate active fact cannot exist.** The unique index below covers the
--    columns that make two rows the same fact, and only the live rows
--    (`deleted_at is null`), so forgetting a fact and remembering it again is a
--    new row rather than a conflict. `nulls not distinct` is what makes that
--    true for `account` and `thread` rows too, whose `product` is null.
--
-- 3. **The row survives its citation.** `source_turn_id` points at the turn the
--    fact was written from; deleting that turn leaves the fact, and the day the
--    turn record is pruned the member's saved fact does not disappear with it.
--    An account deletion is the exception, and it is a cascade: `user_id`
--    references `auth.users`, so the account's facts go with the account - the
--    soft-deleted ones included.
--
-- Scope is what the fact belongs to, and it names its own key:
--   account - the member, everywhere (how they like to be addressed)
--   product - one product ("في الميزانية أنا شهري")
--   thread  - one conversation ("قررنا نأجل هذا الأسبوع")
-- `kind` is the closed set decision 5 leans on: health, legal and financial
-- specifics are stored only when the member asks for them, and the kind is how
-- the page and the extraction schema say so.
--
-- Column list beyond the issue: `thread_id`. `scope = 'thread'` is meaningless
-- without the thread it is scoped to, and deriving it through `source_turn_id`
-- would bind a fact to a record that is allowed to disappear. Named here so it
-- is a review decision rather than a surprise in phase 6.
--
-- Rollback:
--   drop table if exists public.agent_memories;
--   (the table's indexes, policies and trigger go with it; the shared
--   `public.update_updated_at()` is not this file's to drop)
-- ============================================================

create table if not exists public.agent_memories (
  id             uuid primary key default gen_random_uuid(),
  -- The member whose fact this is. `auth.users`, not `public.users`: the account
  -- deletion has to reach these rows without depending on a profile row's own
  -- cascade.
  user_id        uuid not null references auth.users (id) on delete cascade,
  scope          text not null default 'account',
  -- Set exactly when `scope = 'product'`.
  product        text,
  -- Set exactly when `scope = 'thread'`.
  thread_id      uuid references public.chat_conversations (id) on delete cascade,
  -- Why it is remembered. The extraction schema writes this closed set, so a
  -- health, legal or financial fact is visibly one.
  kind           text not null default 'fact',
  -- The fact itself, in the member's own words. Never a credential, a token, a
  -- payment value or another member's data: the writer refuses those, and this
  -- column is the one place that rule cannot be expressed as a constraint.
  text           text not null,
  -- The turn it was written from, when it was not typed into the page.
  source_turn_id uuid references public.agent_turns (id) on delete set null,
  -- How sure the writer was. An explicit `remember` is 1.00; extraction is
  -- below it and anything under the floor is stored but not injected.
  confidence     numeric(3, 2) not null default 1.00,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Soft delete: the page "forgets" without losing that it once knew.
  deleted_at     timestamptz,
  constraint agent_memories_scope check (scope in ('account', 'product', 'thread')),
  constraint agent_memories_kind check (
    kind in ('fact', 'preference', 'health', 'legal', 'financial')
  ),
  constraint agent_memories_text check (length(btrim(text)) between 1 and 500),
  constraint agent_memories_confidence check (confidence between 0 and 1),
  -- One key per scope, and no row that claims a key it is not scoped to.
  constraint agent_memories_scope_key check (
    (scope = 'product' and product is not null and thread_id is null)
    or (scope = 'thread' and thread_id is not null and product is null)
    or (scope = 'account' and product is null and thread_id is null)
  )
);

comment on table public.agent_memories is
  'Facts the member saved or asked the assistant to remember. Owner-only by RLS, soft-deleted by deleted_at, and deleted with the account (ADR-0182).';
comment on column public.agent_memories.scope is
  'account = everywhere, product = one product, thread = one conversation.';
comment on column public.agent_memories.kind is
  'fact | preference | health | legal | financial. The last three are stored only when the member asked for them.';
comment on column public.agent_memories.deleted_at is
  'Set when the member forgets a fact. Only rows where this is null are active: they are what the unique index guards and what recall may inject.';
comment on column public.agent_memories.confidence is
  '1.00 for an explicit remember; lower for extraction. Below the recall floor a row is stored but not injected.';

alter table public.agent_memories enable row level security;

-- A duplicate active fact is impossible, and only among the live ones: the same
-- text after a forget is a new row. `nulls not distinct` makes the null key
-- columns compare equal, which is what `account` and `thread` rows need.
create unique index if not exists uq_agent_memories_active_fact
  on public.agent_memories (
    user_id,
    scope,
    product,
    thread_id,
    kind,
    lower(btrim(text))
  )
  nulls not distinct
  where deleted_at is null;

-- What the page and recall read: one member's active facts, newest first. The
-- scope predicate is left to the query, which reads one scope or all three.
create index if not exists idx_agent_memories_active
  on public.agent_memories (user_id, created_at desc)
  where deleted_at is null;

-- The foreign key's own index (#1086): landing a member's account deletion has
-- to find their rows without reading the whole table.
create index if not exists idx_agent_memories_user
  on public.agent_memories (user_id);

-- RLS is the boundary, in both directions, and there is no admin door.
drop policy if exists "Members read their own memories" on public.agent_memories;
create policy "Members read their own memories"
  on public.agent_memories for select
  to authenticated
  using ( user_id = (select auth.uid()) );

drop policy if exists "Members write their own memories" on public.agent_memories;
create policy "Members write their own memories"
  on public.agent_memories for insert
  to authenticated
  with check ( user_id = (select auth.uid()) );

-- An update may not hand the row to another member: `using` decides which rows
-- this caller may touch, `with check` decides what the row may become.
drop policy if exists "Members edit their own memories" on public.agent_memories;
create policy "Members edit their own memories"
  on public.agent_memories for update
  to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

drop policy if exists "Members delete their own memories" on public.agent_memories;
create policy "Members delete their own memories"
  on public.agent_memories for delete
  to authenticated
  using ( user_id = (select auth.uid()) );

-- Someone signed out reads nothing, and no role reaches the table by default.
revoke all on public.agent_memories from anon, authenticated;
grant select, insert, update, delete on public.agent_memories to authenticated;
-- The extraction writer and the account page run on the service role. It
-- bypasses RLS, not privileges.
grant all on public.agent_memories to service_role;

drop trigger if exists trg_agent_memories_updated_at on public.agent_memories;
create trigger trg_agent_memories_updated_at
  before update on public.agent_memories
  for each row execute function public.update_updated_at();
