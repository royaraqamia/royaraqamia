-- ============================================================
-- The catalogue can carry a brand mark we ship ourselves
--
-- The store draws a mark from two sources: the registry's `icons` and the
-- `logo_uri` an RFC 9728 document publishes. Measured on 2026-11-11, neither
-- exists for the rows members ask for most — Notion, Figma, Atlassian, Stripe,
-- Vercel and Supabase all stored nothing — so every card fell back to a
-- monogram, and a directory of eleven letters is the generic look ADR-0162
-- exists to avoid.
--
-- `icon_override` is the third source, and it is the same seam as
-- `title_override`: the sync writes it only when it is null, so an admin's or
-- the code's choice survives every run. It holds a **same-origin path**
-- (`/brand/mcp/github.svg`) for the marks we ship in `public/brand/mcp`, which
-- keeps the rule the icon proxy exists for: a member's browser never fetches a
-- third party.
--
-- Rollback: drop the column.
-- ============================================================

alter table public.mcp_catalog_servers
  add column if not exists icon_override text;
