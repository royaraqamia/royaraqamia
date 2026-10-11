-- ============================================================
-- Move pg_trgm out of the exposed public schema
--
-- The security advisor flags `extension_in_public` for pg_trgm: it was created
-- in `public` (20260809085258) to back the ILIKE '%..%' GIN indexes. PostgREST
-- exposes the public schema, so every pg_trgm function (similarity, show_trgm,
-- ...) is reachable on the API surface for no reason — nothing in the app calls
-- them over the API; the trigram machinery is used implicitly by the indexes.
--
-- pg_trgm is relocatable (unlike pg_net, which 20260917082727 deliberately left
-- in place). Moving it is safe: every caller uses `col ilike '%..%'`, and the
-- GIN indexes reference `gin_trgm_ops` by OID, so relocating the opclass does
-- not invalidate them — verified by moving the extension inside a rolled-back
-- transaction and confirming the index-backed queries still plan without error.
--
-- Idempotent: a no-op if the extension is already in `extensions`.
--
-- Rollback: alter extension pg_trgm set schema public;
-- ============================================================

do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm' and n.nspname = 'public'
  ) then
    alter extension pg_trgm set schema extensions;
  end if;
end
$$;
