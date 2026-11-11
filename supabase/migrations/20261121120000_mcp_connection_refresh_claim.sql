-- ============================================================
-- One caller spends one refresh token, and one audit row names an app's tool
--
-- Two changes the assistant's app tools need (#1225, #1227). They arrive
-- together because both are about the same promise: a tool of an app we do not
-- own runs on a grant that outlives the hour it was issued for, and the row that
-- remembers what it did has to be able to name the connection it did it on.
--
-- 1. `mcp_connection_credentials.refresh_claimed_at` — the claim.
--
--    A connection's access token lives an hour, and the row already keeps an
--    encrypted refresh token beside it (20261114110000). What was missing is the
--    caller that spends it, and the guard that stops two of them spending it at
--    once: a turn and a tool sync can both notice the same expiring token, and a
--    provider that rotates refresh tokens answers the second exchange with
--    `invalid_grant` — a revocation the member never made.
--
--    The claim is the same shape the handshake already uses (`claimAttempt`):
--    one conditional write that a second caller loses. It is a timestamp rather
--    than a boolean because a caller that dies mid-refresh must not lock the
--    connection forever: a claim older than the window the service applies is
--    abandoned and may be taken. The column is on the credentials row, not the
--    connection: the row is what a refresh writes, and it is created, replaced
--    and deleted with the connection.
--
-- 2. `chat_agent_actions.tool` widens from 60 to 200 characters.
--
--    A remote tool is audited as `app:<connectionId>:<tool>` (ADR-0155,
--    decision 11) — a uuid and a server's own tool name, which is already 41
--    characters before the name. The old bound refused a proposal for any tool
--    whose name passed 19 characters, which is most of them.
--
-- Rollback: drop the column and restore the 60-character check:
--
--   alter table public.mcp_connection_credentials drop column refresh_claimed_at;
--   alter table public.chat_agent_actions drop constraint chat_agent_actions_tool_check;
--   alter table public.chat_agent_actions add constraint chat_agent_actions_tool_check
--     check (char_length(tool) between 1 and 60);
-- ============================================================

alter table public.mcp_connection_credentials
  add column if not exists refresh_claimed_at timestamptz;

comment on column public.mcp_connection_credentials.refresh_claimed_at is
  'The caller that is spending the refresh token right now. Null when nobody is; stale claims are taken over by the next caller.';

alter table public.chat_agent_actions
  drop constraint if exists chat_agent_actions_tool_check;

alter table public.chat_agent_actions
  add constraint chat_agent_actions_tool_check
  check (char_length(tool) between 1 and 200);
