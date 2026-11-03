-- Postgres does not index a foreign-key column automatically, so every
-- `ON DELETE` action on a parent row scans the child table to find the rows it
-- has to cascade or null out. The Supabase performance advisor
-- (`unindexed_foreign_keys`) reported seven such columns on the chat tables
-- (#889); each one below is the child side of a real parent-side operation:
--
--   - `chat_conversations.created_by`, `chat_blocks.blocked_id` and
--     `chat_reports.reporter_id` — `auth.users` references with `on delete
--     cascade`, so the scan is on account deletion;
--   - `chat_messages.sender_id`, `chat_participants.invited_by` and
--     `chat_reports.reported_user_id` — also `auth.users`, but `on delete set
--     null`, so account deletion scans the same tables to null the rows out
--     rather than remove them;
--   - `chat_reports.conversation_id` — `chat_conversations`, on delete cascade.
--
-- Two of them are read columns as well as cascade columns:
-- `chat_conversations.created_by` is the filter in
-- `private.owned_item_count('chat_groups')`, and the report columns are what
-- the moderation reads touch, so the same index answers the count and the
-- queue rather than only the delete.
--
-- The sibling precedent is `20261031180000_index_uncovered_foreign_keys.sql`,
-- which indexed the same class of column on the other tables. The chat tables
-- are small today, which is exactly why this is cheap now: it is purely
-- additive, changes no constraint, column or RLS policy, and no existing query
-- text depends on it.
--
-- Rollback:
--   drop index if exists public.idx_chat_blocks_blocked_id;
--   drop index if exists public.idx_chat_conversations_created_by;
--   drop index if exists public.idx_chat_messages_sender_id;
--   drop index if exists public.idx_chat_participants_invited_by;
--   drop index if exists public.idx_chat_reports_conversation_id;
--   drop index if exists public.idx_chat_reports_reported_user_id;
--   drop index if exists public.idx_chat_reports_reporter_id;

create index if not exists idx_chat_blocks_blocked_id
  on public.chat_blocks (blocked_id);

create index if not exists idx_chat_conversations_created_by
  on public.chat_conversations (created_by);

create index if not exists idx_chat_messages_sender_id
  on public.chat_messages (sender_id);

create index if not exists idx_chat_participants_invited_by
  on public.chat_participants (invited_by);

create index if not exists idx_chat_reports_conversation_id
  on public.chat_reports (conversation_id);

create index if not exists idx_chat_reports_reported_user_id
  on public.chat_reports (reported_user_id);

create index if not exists idx_chat_reports_reporter_id
  on public.chat_reports (reporter_id);
