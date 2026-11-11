-- ============================================================
-- agent_turns.member_id has no covering index (#1086)
--
-- The table is the second child of `public.users` in the chat area and the only
-- one whose foreign key was never indexed. `agent_turns_member_id_fkey` is
-- `on delete cascade`, and Postgres does not index a foreign-key column on its
-- own, so deleting a `public.users` row scans `agent_turns` to find every turn
-- it must remove. The table is append-only and has no retention yet (ADR-0125
-- leaves that for later), so that scan only ever grows.
--
-- `member_id` is a cascade column and nothing else: no query filters on it
-- today, so this is deliberately not a composite. The same class of column was
-- indexed for the older tables in 20261031180000_index_uncovered_foreign_keys
-- and the chat tables in 20261112130000_index_chat_foreign_keys; the Supabase
-- performance advisor reports it as `unindexed_foreign_keys`.
--
-- Purely additive: no column, constraint, trigger, policy or grant moves.
--
-- Rollback:
--   drop index if exists public.idx_agent_turns_member;
-- ============================================================

create index if not exists idx_agent_turns_member
  on public.agent_turns (member_id);
