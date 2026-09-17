-- ============================================================
-- Record which Admin issued a certificate
--
-- public.certificates had no attribution, so a certificate could not be traced to the
-- person who created it. That also meant the client-writable is_admin hole fixed in
-- 20260917074407 could not be audited after the fact: an unauthorised write would have
-- been indistinguishable from a legitimate one.
--
-- Nullable by design. Existing rows keep NULL, and new rows are filled by the issuing
-- Admin's id, threaded through the controller and the MCP tool. The column is NOT part
-- of the public verify response - shared/contracts/certificates.ts excludes it from
-- PublicCertificate so it never reaches an anonymous visitor.
--
-- on delete set null rather than cascade: deleting an operator's auth user should not
-- delete issued certificates.
-- ============================================================

alter table public.certificates
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists idx_certificates_created_by on public.certificates (created_by);
