-- ============================================================
-- The assistant's turn, as a row (ADR-0113, #817)
--
-- A turn used to exist only while its request did: a 60-second function held the
-- provider call, and anything slower or unluckier was an error the member read.
-- This table is the record that outlives it, and the two things it makes
-- possible are measured rather than promised:
--
--   - an attempt count, so a 429 or a 502 is retried once instead of becoming a
--     sentence;
--   - the text that had already streamed when a later round failed, so a
--     half-written answer is not silently discarded.
--
-- It is also the seam the detached worker will claim: a `running` row whose
-- request died is the only thing such a worker needs to be told about.
--
-- Nothing secret lives here. The member's session is deliberately NOT copied
-- into this table: refresh-token rotation is single-use, so a server-side copy
-- would sign the member out (`docs/security.md`, ADR-0023's amendment). A worker
-- mints its own session when it needs one.
--
-- Rollback:
--   drop table if exists public.agent_turns;
-- ============================================================

create table if not exists public.agent_turns (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  member_id       uuid not null references public.users (id) on delete cascade,
  -- `running` while an attempt is in flight or waiting for its retry.
  state           text not null default 'running',
  -- Retries taken before the answer landed; 0 means the first attempt worked.
  attempts        integer not null default 0,
  -- What had already streamed, kept only when the turn failed.
  partial_text    text,
  error           text,
  created_at      timestamptz not null default now(),
  settled_at      timestamptz,
  constraint agent_turns_state check (state in ('running', 'settled', 'failed')),
  constraint agent_turns_attempts check (attempts between 0 and 5)
);

-- A thread's turns, newest first, which is the only read there is.
create index if not exists idx_agent_turns_conversation
  on public.agent_turns (conversation_id, created_at desc);

-- The worker's question: what is still unfinished?
create index if not exists idx_agent_turns_unfinished
  on public.agent_turns (created_at)
  where state = 'running';

alter table public.agent_turns enable row level security;

-- No policy on purpose: a turn is written and read by the service role only, and
-- the member reads their answer in `chat_messages`, where the policy already is.
revoke all on public.agent_turns from anon, authenticated;
grant all on public.agent_turns to service_role;

comment on table public.agent_turns is
  'One assistant turn: its attempt count, what streamed, and how it ended. No session is stored here.';
