-- ============================================================
-- Stop public/anon reads of certificate recipient PII
--
-- `public.certificates` is read with the inlined publishable (anon) key for
-- public verification, but the read policy added in
-- 20260719110314_create_certificates_table.sql was `TO public USING (true)`
-- over a table-wide SELECT grant. RLS is row-level only, so it cannot hide
-- columns: anyone holding the publishable key could call
-- `/rest/v1/certificates?select=recipient_email` and enumerate every
-- recipient's email (and recipient_user_ids / created_by) even though the app
-- projection strips them after the fact.
--
-- Fix: the anon role may only read the columns the public verify projection
-- exposes. The blanket policy is replaced by an anon-only policy plus explicit
-- owner and admin read policies for `authenticated`, so a signed-in user can
-- only read their own rows (or all rows when they are an Admin). The admin web
-- path keeps using `getAdminSupabase` (service role), which bypasses RLS.
--
-- Because anon no longer holds table-wide SELECT, every public read in
-- `backend/repositories/certificates` must name the columns it is allowed to
-- read - PostgREST rejects `select('*')` once a column is not granted.
-- ============================================================

-- 1. anon may read only the columns the public verify projection exposes.
revoke select on public.certificates from anon;

grant select (
  id,
  certificate_code,
  student_name,
  course_name,
  issue_date,
  expiration_date,
  grade_or_status,
  created_at
) on public.certificates to anon;

-- 2. Replace the blanket `TO public USING (true)` policy. Paired with the
--    table-wide SELECT grant that `authenticated` still holds, it let any
--    signed-in user read every other recipient's PII.
drop policy if exists "Public can verify certificates" on public.certificates;

create policy "Anyone can verify certificates"
  on public.certificates
  for select
  to anon
  using (true);

create policy "Recipients can read their own certificates"
  on public.certificates
  for select
  to authenticated
  using (recipient_user_ids @> array[(select auth.uid())]);

create policy "Admins can read certificates"
  on public.certificates
  for select
  to authenticated
  using (private.is_admin());
