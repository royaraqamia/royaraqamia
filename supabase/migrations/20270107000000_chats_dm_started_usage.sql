-- ============================================================
-- A denominator for member-to-member chat starts (#1860)
--
-- The Chats tab used to lead with a member picker that almost nobody took: in
-- 25 days it produced four threads, two of them empty. The way in now is a
-- conversation with a member's profile, and the next review needs to know how
-- many DMs actually start - and where they started from.
--
-- This is a counter, not an allowance. The row below gives every signed-in
-- member a cap no one reaches, and `record_usage` writes one row per conversation
-- under the member's advisory lock. The origin travels in `dedupe_key` as
-- `<origin>:<conversation-id>` (`profile:...` or `picker:...`), so the same
-- conversation retried twice is still one event and the ledger can report a
-- breakdown by origin without a new column. It mirrors
-- `USAGE_COUNTERS.chatsDmStarted`.
--
--   per member   unlimited in practice, lifetime, visitors 0
--
-- Recording is best-effort in the controller: a failed ledger write must never
-- turn an accepted chat request into a refusal.
--
-- Rollback:
--   delete from public.usage_events where action_key = 'chats.dm.started';
--   delete from public.usage_limits where key = 'chats.dm.started';
-- ============================================================

insert into public.usage_limits
  (key, label_ar, "window", visitor_cap, free_cap, pro_cap, sort_order) values
  ('chats.dm.started', 'بدء محادثة مع عضو', 'lifetime', 0, 100000, 100000, 90)
on conflict (key) do update
  set label_ar = excluded.label_ar,
      "window" = excluded."window",
      visitor_cap = excluded.visitor_cap,
      free_cap = excluded.free_cap,
      pro_cap = excluded.pro_cap,
      sort_order = excluded.sort_order,
      updated_at = now();
