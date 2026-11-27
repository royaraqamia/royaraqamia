-- ============================================================
-- The assistant's identity, owned by the member (ADR-0224)
--
-- One private row per member: what their copy is called, which orb variant it
-- wears, which tone it answers in, and one optional line it keeps in view. The
-- row is what makes «نور» a default instead of a constant, and it is the first
-- place the four settings live that the assistant page draws.
--
-- Why private rather than a profile: the name and the mark are a member's own
-- copy, and a shared surface (a group thread, a handed-over task) draws the
-- site's neutral «المساعد» instead. Owner-only RLS is therefore the whole
-- security model, and there is no public read to widen later.
--
-- Why `assistant_key` now: a roster is a row per assistant, not a second table
-- and a migration. Today every row carries 'default'; the column costs one text
-- and the primary key already means "one identity per member per assistant".
--
-- No backfill: a member with no row reads the deployment's default, so nothing
-- changes for anyone until they open /assistant and save something.
--
-- Rollback: drop the table. Grants, memory, threads and coding tasks are
-- untouched; every surface falls back to the default name.
--   drop table if exists public.assistant_identities;
-- ============================================================

create table if not exists public.assistant_identities (
  user_id         uuid not null references auth.users (id) on delete cascade,
  assistant_key   text not null default 'default',
  name            text,
  avatar_variant  smallint,
  tone            text not null default 'default',
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, assistant_key),
  -- The contract refuses these too; the table refuses them for any writer that
  -- is not the API, including a future backfill or a hand-run query.
  constraint assistant_identities_name_length check (name is null or char_length(name) between 1 and 24),
  constraint assistant_identities_avatar_variant check (avatar_variant is null or avatar_variant between 1 and 12),
  constraint assistant_identities_tone check (tone in ('default', 'concise', 'warm', 'formal')),
  constraint assistant_identities_note_length check (note is null or char_length(note) <= 120)
);

comment on table public.assistant_identities is
  'The member''s own assistant identity (ADR-0224): name, mark variant, tone and note. Owner-only; nothing here is public.';

alter table public.assistant_identities enable row level security;

drop policy if exists "Members read their own assistant" on public.assistant_identities;
create policy "Members read their own assistant"
  on public.assistant_identities for select
  to authenticated
  using ( user_id = (select auth.uid()) );

drop policy if exists "Members create their own assistant" on public.assistant_identities;
create policy "Members create their own assistant"
  on public.assistant_identities for insert
  to authenticated
  with check ( user_id = (select auth.uid()) );

-- `using` decides which row this caller may touch, `with check` decides what it
-- may become: an update may not hand the row to another member.
drop policy if exists "Members edit their own assistant" on public.assistant_identities;
create policy "Members edit their own assistant"
  on public.assistant_identities for update
  to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

drop policy if exists "Members reset their own assistant" on public.assistant_identities;
create policy "Members reset their own assistant"
  on public.assistant_identities for delete
  to authenticated
  using ( user_id = (select auth.uid()) );

-- Someone signed out reads nothing, and no role reaches the table by default.
revoke all on public.assistant_identities from anon, authenticated;
grant select, insert, update, delete on public.assistant_identities to authenticated;
