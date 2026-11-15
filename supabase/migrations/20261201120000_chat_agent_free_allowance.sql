-- ============================================================
-- The assistant has a limited free allowance (#1456, phase 0)
--
-- `20261110120000_chat_agent_allowance.sql` seeded `chat.agent.turn` at
-- free 0 / pro 40, and zero is what made نور a paid-only feature: `record_usage`
-- refused a Free member before anything was written, and both clients drew the
-- upgrade instead of a composer.
--
-- The settled answer to "who gets it" is paid plus a limited free tier. Turns
-- and app calls stay metered, so the wall becomes a small daily allowance: a free
-- member asks ten times a day, and only the spent day is a sentence.
--
-- The numbers are named constants in this file so the owner tunes them in review,
-- before the migration is applied. What enforces them does not move: the caps
-- stay the `public.usage_limits` row that `chat_agent_allowance` reports and
-- `record_usage` refuses against, so no client ever guesses a cap (ADR-0093,
-- ADR-0113).
--
--   free      10 turns   (was 0: the paid-only wall)
--   pro       40 turns   unchanged — this migration only opens the door
--   app calls  5 / 50    unchanged (`20261122120000_mcp_call_allowance.sql`)
--
-- The project ceiling (200 turns a day, `app_settings`) and the per-turn app
-- budget (3 calls, 2 per connection) are unchanged.
--
-- Rollback:
--   update public.usage_limits
--      set free_cap = 0, updated_at = now()
--    where key = 'chat.agent.turn';
-- ============================================================

do $$
declare
  -- The free tier's turns in one Damascus day. Ten is the start: enough to try
  -- the assistant on a real question, small enough that the paid day still buys
  -- something. The Pro cap is deliberately not restated here.
  free_turns constant integer := 10;
  updated    integer;
begin
  update public.usage_limits
     set free_cap = free_turns,
         updated_at = now()
   where key = 'chat.agent.turn';

  get diagnostics updated = row_count;
  -- A missing row would leave the wall standing and the deploy looking applied,
  -- so the migration fails where a person can see it.
  if updated = 0 then
    raise exception 'usage_limits has no chat.agent.turn row to give a free allowance';
  end if;
end;
$$;
