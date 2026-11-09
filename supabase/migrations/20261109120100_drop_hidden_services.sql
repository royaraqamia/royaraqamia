-- ============================================================
-- Hidden services is retired
--
-- The homepage owns the services list now (ADR-0146), and the menu that
-- ADR-0112 let a member trim is the same add/remove sheet. Hiding a row and
-- adding it to the homepage are one preference, so the separate hidden set has
-- no surface left to mean anything (ADR-0148).
--
-- The table is dropped, not left dormant: a preference with no reader is drift,
-- and the only rows it holds are the app routes a member once hid.
--
-- Rollback: re-create `public.hidden_services` from
-- `20261102120000_hidden_services.sql`; the dropped rows cannot be restored,
-- which is acceptable for a presentation preference.
-- ============================================================

drop table if exists public.hidden_services;
