-- ============================================================
-- The member controls what is remembered (ADR-0182 decision 6, #1428)
--
-- Decision 6 names five controls: view, edit, delete, export, a per-scope
-- toggle, and "forget this conversation". Viewing and editing are reads and
-- writes the policies in `20261202120000` already answer. The other three are
-- not expressible from a client, and each is decided here:
--
-- 1. **Forgetting a fact deletes its embedding in the same transaction.** The
--    fact is soft-deleted (`deleted_at`), so no foreign key reaches the vector;
--    the two statements are therefore one function, not two calls a reader has
--    to trust to arrive in order. `security definer` because a member holds no
--    delete grant on `agent_memory_embeddings` (deliberately: a member must not
--    forge a vector), and `auth.uid()` is the ownership check that keeps the
--    door from becoming a way to forget somebody else's row.
--
-- 2. **Forgetting a conversation forgets its facts.** A `thread`-scoped fact
--    belongs to one conversation, and "forget this conversation" is that set.
--    It is a second function for the same reason as the first: one statement
--    pair, one transaction, and the member's own rows only. The conversation
--    itself, its messages and its summary are not touched — the summary is
--    context injected into the turn, not memory (ADR-0182's 2026-11-15
--    amendment), and deleting the thread is not what the button says.
--
-- 3. **A per-scope toggle is a row, and recall reads it.** Storing a switch
--    without honouring it would be a false control, so `agent_memory_nearest`
--    is rewritten to skip a scope the member switched off: a disabled scope is
--    neither written (the one door refuses it, `agent-memory-service.ts`) nor
--    injected. Off is not "hidden from the page": the facts stay listed and
--    deletable, which is what decision 6 promises.
--
-- One row per member, not one column per scope on the account row: the grant
-- that answers "may I read settings" is then the same owner-only policy the
-- fact store uses, and a deployment that never writes a row reads the defaults
-- (`true`) instead of a null it has to interpret.
--
-- Rollback:
--   drop function if exists public.agent_memory_forget_thread(uuid);
--   drop function if exists public.agent_memory_forget(uuid);
--   drop table if exists public.agent_memory_settings;
--   and re-apply supabase/migrations/20261204120000_agent_memory_recall_scope.sql,
--   which creates the five-argument `agent_memory_nearest` without the toggles.
-- ============================================================

create table if not exists public.agent_memory_settings (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  -- On by default: memory is the product's promise, and a member switches a
  -- scope off rather than on.
  account_enabled boolean not null default true,
  product_enabled boolean not null default true,
  thread_enabled  boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.agent_memory_settings is
  'Which scopes the member lets the assistant remember, one row per account. Owner-only by RLS; a missing row means every scope is on (ADR-0182 decision 6).';
comment on column public.agent_memory_settings.account_enabled is
  'When false, nothing new is saved at account scope and no account fact is injected.';
comment on column public.agent_memory_settings.product_enabled is
  'When false, nothing new is saved at product scope and no product fact is injected.';
comment on column public.agent_memory_settings.thread_enabled is
  'When false, nothing new is saved at thread scope and no thread fact is injected.';

alter table public.agent_memory_settings enable row level security;

drop policy if exists "Members read their own memory settings" on public.agent_memory_settings;
create policy "Members read their own memory settings"
  on public.agent_memory_settings for select
  to authenticated
  using ( user_id = (select auth.uid()) );

drop policy if exists "Members create their own memory settings" on public.agent_memory_settings;
create policy "Members create their own memory settings"
  on public.agent_memory_settings for insert
  to authenticated
  with check ( user_id = (select auth.uid()) );

drop policy if exists "Members change their own memory settings" on public.agent_memory_settings;
create policy "Members change their own memory settings"
  on public.agent_memory_settings for update
  to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

revoke all on public.agent_memory_settings from anon, authenticated;
grant select, insert, update on public.agent_memory_settings to authenticated;
grant all on public.agent_memory_settings to service_role;

drop trigger if exists trg_agent_memory_settings_updated_at on public.agent_memory_settings;
create trigger trg_agent_memory_settings_updated_at
  before update on public.agent_memory_settings
  for each row execute function public.update_updated_at();

-- ============================================================
-- Forgetting one fact, vector included
--
-- The order is deliberate: the vector goes first, against the same ownership
-- predicate, so a fact that is not the caller's has no vector to delete and no
-- row to update. A definer function without that predicate would be a door
-- around the policies `20261202120000` drew, which decision 7 forbids.
-- ============================================================

create or replace function public.agent_memory_forget(p_memory_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_user uuid := auth.uid();
  v_forgotten boolean := false;
begin
  if v_user is null then
    raise exception 'forbidden';
  end if;

  delete from public.agent_memory_embeddings e
  using public.agent_memories m
  where e.memory_id = m.id
    and m.id = p_memory_id
    and m.user_id = v_user;

  update public.agent_memories
     set deleted_at = now()
   where id = p_memory_id
     and user_id = v_user
     and deleted_at is null;

  v_forgotten := found;
  return v_forgotten;
end;
$fn$;

comment on function public.agent_memory_forget(uuid) is
  'Forgets one of the caller''s facts: soft-deletes the row and deletes its embedding in one transaction. Answers whether a live fact was forgotten.';

revoke all on function public.agent_memory_forget(uuid) from public, anon;
grant execute on function public.agent_memory_forget(uuid) to authenticated, service_role;

-- ============================================================
-- Forgetting a conversation
--
-- `thread_id` is the fact's own key (`agent_memories_scope_key`), so this set is
-- exactly what "this conversation" means: a thread fact, live, and the
-- caller's. The count is what the button reports back, and it is 0 rather than
-- an error when there was nothing to forget.
-- ============================================================

create or replace function public.agent_memory_forget_thread(p_thread_id uuid)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_user uuid := auth.uid();
  v_forgotten integer := 0;
begin
  if v_user is null then
    raise exception 'forbidden';
  end if;

  delete from public.agent_memory_embeddings e
  using public.agent_memories m
  where e.memory_id = m.id
    and m.thread_id = p_thread_id
    and m.user_id = v_user
    and m.deleted_at is null;

  update public.agent_memories
     set deleted_at = now()
   where thread_id = p_thread_id
     and user_id = v_user
     and deleted_at is null;

  v_forgotten := found;
  return v_forgotten;
end;
$fn$;

comment on function public.agent_memory_forget_thread(uuid) is
  'Forgets every live thread fact of the caller in one conversation, and their embeddings, in one transaction. Answers how many facts were forgotten.';

revoke all on function public.agent_memory_forget_thread(uuid) from public, anon;
grant execute on function public.agent_memory_forget_thread(uuid) to authenticated, service_role;

-- ============================================================
-- Recall, with the toggles honoured
--
-- The body is `20261204120000`'s, plus the settings join and one condition per
-- scope. `coalesce(..., true)` is the missing-row default: a member who has
-- never opened the page has no row, and memory is on for them.
--
-- The function stays `security invoker`: both tables it reads are owner-only by
-- RLS, so the member's own session is what answers "which rows may I see", and
-- the service role (the backfill, an operator's query) reads without a second
-- authority. The signature is unchanged, so this replaces in place.
-- ============================================================

create or replace function public.agent_memory_nearest(
  p_user_id uuid,
  p_query extensions.vector,
  p_limit integer default 6,
  p_thread_id uuid default null,
  p_product text default null
)
returns table (
  memory_id  uuid,
  text       text,
  similarity double precision,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    m.id as memory_id,
    m.text,
    1 - (e.embedding <=> p_query) as similarity,
    m.updated_at
  from public.agent_memory_embeddings e
  join public.agent_memories m on m.id = e.memory_id
  left join public.agent_memory_settings s on s.user_id = p_user_id
  where e.user_id = p_user_id
    and m.deleted_at is null
    and (
      (m.scope = 'account' and coalesce(s.account_enabled, true))
      -- A product fact is recalled only where the turn knows the product, and
      -- only for that product: an unknown product is not every product.
      or (
        m.scope = 'product'
        and p_product is not null
        and m.product = p_product
        and coalesce(s.product_enabled, true)
      )
      -- A thread fact never leaves its own thread.
      or (
        m.scope = 'thread'
        and p_thread_id is not null
        and m.thread_id = p_thread_id
        and coalesce(s.thread_enabled, true)
      )
    )
  order by e.embedding <=> p_query
  limit greatest(1, least(coalesce(p_limit, 6), 24));
$$;

comment on function public.agent_memory_nearest(uuid, extensions.vector, integer, uuid, text) is
  'The k nearest active facts for one member, inside the thread and product the turn is in, skipping any scope the member switched off. The query vector comes from the caller: a turn never embeds its own read path.';

revoke all on function public.agent_memory_nearest(uuid, extensions.vector, integer, uuid, text)
  from public, anon;
grant execute on function public.agent_memory_nearest(uuid, extensions.vector, integer, uuid, text)
  to authenticated, service_role;
