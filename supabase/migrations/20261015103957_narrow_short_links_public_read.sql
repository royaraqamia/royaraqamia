-- ============================================================
-- Stop anon reads of short-link password hashes and owners
--
-- `public.short_links` was read with the inlined publishable (anon) key over a
-- table-wide SELECT grant and the blanket `short_links_read` policy
-- (`FOR SELECT TO public USING (true)`). Since
-- 20260818093434_links_password.sql added `password_hash`, anyone holding the
-- publishable key could call
-- `/rest/v1/short_links?select=password_hash,original_url,user_id` and read the
-- password hash and owner of every code — offline cracking of password-protected
-- links and enumeration of every user's destinations. RLS is row-level only, so
-- it cannot hide the column.
--
-- Fix: `anon` loses SELECT on the table entirely. The anonymous redirect and the
-- password unlock resolve through the service role (`getAdminSupabase`), which
-- bypasses RLS, keeps the hash server-side, and never exposes it over the Data
-- API. The blanket `TO public USING (true)` read policy is replaced with an
-- owner-scoped policy so a signed-in user can only read their own rows (the MCP
-- list/analytics paths already filter by `auth.uid()`), closing the same
-- cross-tenant read for `authenticated`.
-- ============================================================

revoke select on public.short_links from anon;

drop policy if exists short_links_read on public.short_links;

create policy short_links_read
  on public.short_links
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
