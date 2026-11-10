-- ============================================================
-- chat_agent_actions evaluates auth.uid() per row, and its resolved_by FK has
-- no index (#994)
--
-- The table arrived after the chats tables had settled the shape, so it is the
-- one that reads the caller the expensive way: both policies call `auth.uid()`
-- in their predicate, and the planner treats it as a volatile expression, so it
-- is evaluated for every row a thread render scans instead of once per query
-- (`auth_rls_initplan`). Wrapping it in a scalar subquery makes it an InitPlan,
-- which is what `20261103090000_chats.sql` does everywhere else.
--
-- `resolved_by` also carries a foreign key with no covering index
-- (`unindexed_foreign_keys`): removing a member row makes Postgres scan this
-- table to find what it must set null. The same parent-side reasoning that
-- indexed `rate_sync_runs.snapshot_id` in #738 applies here.
--
-- The predicates themselves do not move: `proposed` still resolves to
-- `rejected` or `confirmed`, `confirmed` still resolves to `applied` or
-- `failed`, and only the member whose confirmation claimed the row may move it.
-- Roles are unchanged (the policies still apply to every role, as they did).
--
-- Untouched: private.guard_chat_agent_action(), the grants on the table, and
-- the columns.
--
-- Rollback:
--   recreate both policies as they stand in
--     20261112090000_chat_agent_actions.sql (the `auth.uid()` form);
--   drop index if exists public.idx_chat_agent_actions_resolved_by;
-- ============================================================

drop policy if exists "Members read their proposals" on public.chat_agent_actions;
create policy "Members read their proposals"
  on public.chat_agent_actions for select
  using (private.chat_is_participant(conversation_id, (select auth.uid())));

drop policy if exists "Members resolve their proposals" on public.chat_agent_actions;
create policy "Members resolve their proposals"
  on public.chat_agent_actions for update
  using (
    private.chat_is_participant(conversation_id, (select auth.uid()))
    and (
      status = 'proposed'
      or (status = 'confirmed' and resolved_by = (select auth.uid()))
    )
  )
  with check (
    private.chat_is_participant(conversation_id, (select auth.uid()))
    and resolved_by = (select auth.uid())
  );

create index if not exists idx_chat_agent_actions_resolved_by
  on public.chat_agent_actions (resolved_by);
