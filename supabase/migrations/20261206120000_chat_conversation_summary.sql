-- ============================================================
-- The window is summarised, not enlarged (ADR-0182 decision 4; #1512)
--
-- `trimHistory` hands the model the last twenty messages. That is a window, not
-- a memory: the twenty-first message reintroduces the member to the assistant.
-- This file gives the conversation the columns that carry the beginning, so the
-- window can stay twenty (decision 4 says so explicitly: the fix is not a larger
-- window).
--
-- Three columns, and each one earns its place:
--
-- 1. `summary` is the prose. It is written by the service role after an answer,
--    never by the member, and it is bounded (1–1200 characters) here as well as
--    in the service — a block injected on every turn is a cost, and the column is
--    where that cost stops.
--
-- 2. `summary_through_message_id` is the cursor, **a message id and not a count**.
--    A count says "the first forty", which is a lie the moment a message above it
--    is deleted: the summary would claim to have read a message that is now
--    forty-first. An id says "this message and everything before it", and a
--    deleted message clears it (`on delete set null`) instead of silently
--    shifting what the summary is said to cover. A cleared cursor means the next
--    regeneration starts from the beginning, which is the safe direction.
--
-- 3. `summary_updated_at` is when it was written: the operator's line, and the
--    tie-breaker a stale write loses on. It is set exactly when `summary` is.
--
-- No policy and no grant is added. The summary is read through the member's own
-- session, and `chat_conversations` already grants `select` to `authenticated`
-- with a policy that answers for one member's threads; the write is the service
-- role's, which already holds `update`. A new policy here would widen the table
-- for a column the existing policy already covers.
--
-- Rollback:
--   drop index if exists public.idx_chat_conversations_summary_cursor;
--   alter table public.chat_conversations
--     drop constraint if exists chat_conversations_summary_stamped,
--     drop constraint if exists chat_conversations_summary_cursor_needs_summary,
--     drop constraint if exists chat_conversations_summary_bounded,
--     drop column if exists summary_updated_at,
--     drop column if exists summary_through_message_id,
--     drop column if exists summary;
-- ============================================================

alter table public.chat_conversations
  add column if not exists summary text,
  add column if not exists summary_through_message_id uuid
    references public.chat_messages (id) on delete set null,
  add column if not exists summary_updated_at timestamptz;

comment on column public.chat_conversations.summary is
  'The rolling summary of everything the twenty-message window no longer holds (ADR-0182 decision 4). Written by the service role, read through the member''s own session.';
comment on column public.chat_conversations.summary_through_message_id is
  'The cursor: the last message the summary has read. An id rather than a count, so deleting a message clears it instead of making the summary claim the future.';
comment on column public.chat_conversations.summary_updated_at is
  'When the summary was last regenerated. Set exactly when summary is, and the value a concurrent stale write loses on.';

-- The column's own ceiling, mirrored from the service. A summary longer than
-- this is a provider answering a different question than the one asked.
alter table public.chat_conversations
  add constraint chat_conversations_summary_bounded
    check (summary is null or char_length(summary) between 1 and 1200),
  -- A cursor without a summary names nothing, and a timestamped summary with no
  -- text is a block that says "there is more" and shows nothing.
  add constraint chat_conversations_summary_cursor_needs_summary
    check (summary_through_message_id is null or summary is not null),
  add constraint chat_conversations_summary_stamped
    check ((summary is null) = (summary_updated_at is null));

-- The foreign key's own index (#1086): deleting a message sets the cursor of
-- every conversation that had seen it to null, and without this it scans the
-- table once per deleted message.
create index if not exists idx_chat_conversations_summary_cursor
  on public.chat_conversations (summary_through_message_id)
  where summary_through_message_id is not null;
