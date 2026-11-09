-- Two SELECT policies per table, merged into one (#1188)
--
-- `supabase_get_advisors` reports `multiple_permissive_policies` for
-- `public.certificates` and `public.chat_conversations`. Permissive policies are
-- OR-ed, so two `SELECT` policies for `authenticated` are two evaluations per
-- row, and on both tables one branch is a `STABLE SECURITY DEFINER` helper whose
-- result does not depend on the row:
--
-- - `certificates` ran `private.is_admin()` for every row the admin console
--   listed; the helper scans `app_settings.admin_emails`;
-- - `chat_conversations` runs `private.chat_has_conversation_access()` for every
--   row, and `public.list_chat_threads()` is `security invoker`, so the whole
--   inbox read pays it.
--
-- Each table keeps the same two conditions inside a single policy for
-- `authenticated`. `private.is_admin()` is wrapped in a scalar subquery so the
-- planner evaluates it once per query (an InitPlan) instead of once per row;
-- the chat helper still takes the row's `id` and stays per row.
--
-- The access matrix does not move:
--
-- - a recipient still reads their own certificate, an Admin still reads every
--   one, and a signed-in non-recipient still reads none;
-- - a creator still reads the thread they opened, a participant still reads
--   theirs through the helper, and a non-participant still reads neither.
--
-- Untouched: the `anon` policy `Anyone can verify certificates`, the
-- column-level grants on `public.certificates`, and every INSERT/UPDATE/DELETE
-- policy on both tables.
--
-- Rollback: recreate the policies this file merges, from
-- `20261014105746_narrow_certificate_public_read.sql` and
-- `20261103090000_chats.sql` / `20261103120000_chat_creator_opens_the_thread.sql`.

drop policy if exists "Admins can read certificates" on public.certificates;
drop policy if exists "Recipients can read their own certificates" on public.certificates;

create policy "Admins and recipients read certificates"
  on public.certificates
  for select
  to authenticated
  using (
    (select private.is_admin())
    or recipient_user_ids @> array[(select auth.uid())]
  );

drop policy if exists "Creators read their conversation" on public.chat_conversations;
drop policy if exists "Members read their conversations" on public.chat_conversations;

create policy "Members read their conversations"
  on public.chat_conversations
  for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or private.chat_has_conversation_access(id, (select auth.uid()))
  );
