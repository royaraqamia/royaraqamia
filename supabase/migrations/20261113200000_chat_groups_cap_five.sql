-- ============================================================
-- The group cap joins the rest of the catalogue at 5 / 50
--
-- `20261109090000_chat_groups.sql` seeded `chat_groups` at 3 free / 20 Pro — the
-- two numbers ADR-0113 picked before the pricing page learned to read the
-- catalogue. That page prints one "عناصر من كل خدمة" number, and it can only
-- print a single number by printing the **smallest** non-MCP cap, so a group
-- limit below the rest silently rewrote the headline allowance for every
-- service: the page said 3 and 20 while habits, notes, links and the rest were
-- seeded 5 and 50.
--
-- ADR-0093's rule is that the page promises what the database enforces, so the
-- fix is the row, not the sentence: the group cap moves onto the same 5 / 50
-- step as the other owned items. Nothing else changes — the trigger, the Node
-- pre-check and `private.owned_item_count` all read this row.
--
-- Rollback:
--   update public.plan_limits
--      set free_cap = 3, pro_cap = 20, updated_at = now()
--    where key = 'chat_groups';
-- ============================================================

update public.plan_limits
   set free_cap = 5,
       pro_cap = 50,
       updated_at = now()
 where key = 'chat_groups';
