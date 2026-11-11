-- ============================================================
-- Every remote app call is counted (#1226, ADR-0155 decision 9)
--
-- A turn can reach an app we do not own, so it can spend three things at once:
-- our egress, a stranger's rate limit, and the member's own day. A counter of
-- its own is what bounds the third and makes the first two visible.
--
--   * `mcp.call` — «استدعاء تطبيق خارجي» — daily, free 5 / pro 50. Every remote
--     call spends it, a read exactly like a write: all three costs above are
--     charged by a read. What the model costs is still `chat.agent.turn`.
--   * A visitor gets zero, because an external app has no visitor path: the
--     assistant needs an account (ADR-0113), and its tools come with it.
--
-- The numbers are catalogue rows, not constants (ADR-0093): the composer's
-- meter, the pricing page and `record_usage` all read this one row, and changing
-- the allowance is a seed, not a deploy.
--
-- The seeded `mcp.tool.write` row stays unused. Its label says "inbound write",
-- and pointing the outbound path at it would make the pricing page lie.
--
-- Rollback:
--   delete from public.usage_limits where key = 'mcp.call';
-- ============================================================

insert into public.usage_limits
  (key, label_ar, "window", visitor_cap, free_cap, pro_cap, sort_order) values
  ('mcp.call', 'استدعاء تطبيق خارجي', 'daily', 0, 5, 50, 60)
on conflict (key) do update
  set label_ar = excluded.label_ar,
      "window" = excluded."window",
      visitor_cap = excluded.visitor_cap,
      free_cap = excluded.free_cap,
      pro_cap = excluded.pro_cap,
      sort_order = excluded.sort_order,
      updated_at = now();
