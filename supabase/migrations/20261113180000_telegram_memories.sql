-- ============================================================
-- Long-term memory: distilled, not a longer transcript
--
-- Ten recent messages are enough to follow a conversation and useless a day
-- later. Growing the window would grow the prompt until every message costs a
-- transcript, so the memory is distilled instead:
--
--   - `telegram_summaries` (already present) holds the rolling narrative;
--   - `telegram_memories` holds what is worth keeping as a fact - a preference,
--     a decision, a piece of the owner's context - one short sentence each,
--     unique per chat so the same fact is not stored twice.
--
-- `remember` reads the messages since the last cursor, asks the model for a
-- summary and the durable facts, stores both, and advances the cursor in
-- `telegram_state`. The answer route then reads: the last ten messages, the
-- summary, and the memories.
--
-- This is what "it learns what I like" can honestly mean here: the model's
-- weights never change, but its context does, and it is inspectable and
-- deletable row by row. Nothing is inferred from anyone else's data.
--
-- Rollback:
--   drop table if exists public.telegram_memories;
--   delete from public.telegram_state where key = 'memory_cursor';
-- ============================================================

create table if not exists public.telegram_memories (
  id bigserial primary key,
  chat_id bigint not null,
  -- preference: what the owner likes or wants; fact: about them or their work;
  -- project: something about the repository the bot was told and should keep.
  kind text not null default 'fact' check (kind in ('preference', 'fact', 'project')),
  content text not null,
  created_at timestamptz not null default now(),
  unique (chat_id, content)
);

create index if not exists idx_telegram_memories_chat
  on public.telegram_memories (chat_id, created_at desc);

alter table public.telegram_memories enable row level security;

revoke all on public.telegram_memories from anon, authenticated;
grant all on public.telegram_memories to service_role;
grant usage, select on sequence public.telegram_memories_id_seq to service_role;
