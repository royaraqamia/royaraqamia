-- A member approves or rejects a proposed coding step by updating its row with
-- their own RLS-scoped client (ADR-0219). The stage-1 migration granted only
-- SELECT and INSERT on coding_steps, so the decision route was denied at the
-- grant layer even though the policy allowed the owner to update the row.
--
-- Rollback: revoke update on public.coding_steps from authenticated.

grant update on public.coding_steps to authenticated;
