-- ============================================================
-- The keyboard's AI rewrite spends the member's own allowance (ADR-0220)
--
-- A rewrite is one bounded call behind our gateway, paid by the same ledger as
-- every other counted action. It has no visitor path: the scoped credential is
-- minted from a signed-in web session, so a visitor can never reach the endpoint
-- with a valid token. The daily row mirrors `USAGE_COUNTERS.keyboardRewrites` and
-- the fallback in `backend/loaders/plans.ts`.
--
--   per member   free 5 / pro 50 rewrites a day, daily at Damascus midnight
--
-- `record_usage` counts it under the member's own advisory lock, and a failed or
-- timed-out call calls `release_usage`, so nothing is spent for an answer the
-- member never saw. No token table is added: the rewrite credential is a short-
-- lived HMAC claim verified in the application, and revocation deletes the only
-- copy from the device.
--
-- Rollback:
--   delete from public.usage_limits where key = 'keyboard.rewrite';
--   delete from public.usage_events where action_key = 'keyboard.rewrite';
-- ============================================================

insert into public.usage_limits
  (key, label_ar, "window", visitor_cap, free_cap, pro_cap, sort_order) values
  ('keyboard.rewrite', 'إعادة صياغة من لوحة المفاتيح', 'daily', 0, 5, 50, 80)
on conflict (key) do update
  set label_ar = excluded.label_ar,
      "window" = excluded."window",
      visitor_cap = excluded.visitor_cap,
      free_cap = excluded.free_cap,
      pro_cap = excluded.pro_cap,
      sort_order = excluded.sort_order,
      updated_at = now();
