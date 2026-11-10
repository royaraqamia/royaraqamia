-- ============================================================
-- The connected-apps cap counts both directions, so it is 5 and 50
--
-- `mcp_connected_apps` used to mean "MCP clients connected to us", and one app
-- was the free plan's whole allowance. Since ADR-0155 the same pool holds the
-- inbound grants **and** the outbound connections نور makes, so 1 / 10 stopped
-- describing anything a member could use: one connected agent would have taken
-- the free plan's only slot, and the marketplace exists to be used.
--
-- The count already covers both halves (20261114110000); this file changes the
-- numbers and the word. The label stops saying "MCP apps connected to us"
-- because the row now counts apps we reach as well.
--
-- Rollback:
--   update public.plan_limits
--      set free_cap = 1, pro_cap = 10,
--          label_ar = 'تطبيقات MCP المتصلة', updated_at = now()
--    where key = 'mcp_connected_apps';
-- ============================================================

update public.plan_limits
   set free_cap = 5,
       pro_cap = 50,
       label_ar = 'التَّطبيقات المتَّصلة',
       updated_at = now()
 where key = 'mcp_connected_apps';
