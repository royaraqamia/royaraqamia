-- RLS assertions for the authorization model.
-- Run with `supabase test db` against the local stack - see README.md.
--
-- Every write attempted here is expected to be refused, so a failed rollback cannot
-- leave data behind. Positive-path writes belong in a disposable stack.

begin;

create extension if not exists pgtap;

select plan(36);

-- is_admin(): identity from the verified JWT, allowlist from app_settings, and no
-- dependence on the non-authoritative users.is_admin column.

select set_config('request.jwt.claims', '{}', true);
select is(public.is_admin(), false, 'is_admin() is false when the caller has no email claim');

select set_config('request.jwt.claims', '{"email":"stranger@example.invalid"}', true);
select is(public.is_admin(), false, 'is_admin() is false for a non-allowlisted email');

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000000000001',
    'email', (select admin_emails[1] from public.app_settings where id)
  )::text,
  true
);
select is(public.is_admin(), true, 'is_admin() is true for an allowlisted email');

-- A signed-in non-admin cannot insert a certificate. `authenticated` holds the
-- table-level INSERT grant (certificates acl includes a for anon and authenticated), so
-- the admin-only policy is what has to refuse this, not a missing privilege.

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"stranger@example.invalid"}',
  true
);

set local role authenticated;

select throws_ok(
  $$insert into public.certificates
      (id, certificate_code, student_name, course_name, issue_date,
       recipient_user_ids, created_at)
    values (gen_random_uuid(), 'RLSTEST-1', 'test', 'test', current_date, '{}', now())$$,
  '42501',
  null,
  'a non-admin cannot insert a certificate'
);

-- The two authorization inputs themselves are refused at the column level, which is
-- what stops a user making themselves an Admin. Permission checks happen before row
-- filtering, so these raise even when no row would match.

select throws_ok(
  $$update public.users set is_admin = true
     where id = '00000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'a user cannot set their own users.is_admin flag'
);

select throws_ok(
  $$update public.users set email = 'attacker@example.invalid'
     where id = '00000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'a user cannot rewrite their own users.email'
);

-- project_requests holds anonymous leads, so it is service-role only: neither
-- anon nor authenticated has any access, exactly like training_applications.
-- See 20260925133716_create_project_requests.sql.
--
-- Still `authenticated` from the assertions above.

select throws_ok(
  $$insert into public.project_requests
      (full_name, phone_whatsapp, project_type, description, reference_code)
    values ('test', '+963111111111', 'website', 'test', 'RLSTEST-PRJ-1')$$,
  '42501',
  null,
  'an authenticated user cannot insert a project request'
);

set local role anon;

select throws_ok(
  $$select * from public.project_requests limit 1$$,
  '42501',
  null,
  'anon cannot read project_requests'
);

reset role;

-- Asserted through the privilege catalogue rather than a write, so this file
-- keeps its "no write can succeed here" invariant.
select ok(
  has_table_privilege('service_role', 'public.project_requests', 'insert'),
  'service_role can insert project_requests'
);

-- retainers holds anonymous maintenance requests and is service-role only for the
-- same reason. See 20260925133809_create_retainers.sql.

set local role authenticated;

select throws_ok(
  $$insert into public.retainers
      (full_name, phone_whatsapp, current_projects, needs, reference_code)
    values ('test', '+963111111111', 'test', 'test', 'RLSTEST-RET-1')$$,
  '42501',
  null,
  'an authenticated user cannot insert a retainer'
);

set local role anon;

select throws_ok(
  $$select * from public.retainers limit 1$$,
  '42501',
  null,
  'anon cannot read retainers'
);

reset role;

select ok(
  has_table_privilege('service_role', 'public.retainers', 'insert'),
  'service_role can insert retainers'
);

-- Certificate reads: anon holds only the public projection, so the PII columns
-- are refused at the privilege level before row filtering. The row-scoped
-- owner/admin policies for `authenticated` live in
-- 20261014105746_narrow_certificate_public_read.sql.

select ok(
  not has_table_privilege('anon', 'public.certificates', 'select'),
  'anon has no table-wide SELECT on certificates'
);

select ok(
  has_column_privilege('anon', 'public.certificates', 'certificate_code', 'select'),
  'anon can read the certificate code'
);

select ok(
  not has_column_privilege('anon', 'public.certificates', 'recipient_email', 'select'),
  'anon cannot read recipient_email'
);

select ok(
  not has_column_privilege('anon', 'public.certificates', 'recipient_user_ids', 'select'),
  'anon cannot read recipient_user_ids'
);

select ok(
  not has_column_privilege('anon', 'public.certificates', 'created_by', 'select'),
  'anon cannot read created_by'
);

select ok(
  has_table_privilege('authenticated', 'public.certificates', 'select'),
  'authenticated holds the table-wide SELECT grant, constrained by RLS'
);

-- short_links is service-role only for writes (#460). 20261015103957 revoked
-- anon SELECT, but the table kept INSERT/UPDATE/DELETE for both client roles and
-- an insert policy that accepted `user_id is null`, so the publishable key could
-- create rows straight through the Data API and bypass the rate limit and URL
-- validation in backend/services/linksnap/shorten-url.ts.
-- 20261021150000_revoke_short_links_client_writes.sql closes that path.

select ok(
  not has_table_privilege('anon', 'public.short_links', 'insert'),
  'anon has no table-wide INSERT on short_links'
);

select ok(
  not has_table_privilege('anon', 'public.short_links', 'update'),
  'anon has no table-wide UPDATE on short_links'
);

select ok(
  not has_table_privilege('anon', 'public.short_links', 'delete'),
  'anon has no table-wide DELETE on short_links'
);

select ok(
  not has_table_privilege('authenticated', 'public.short_links', 'insert'),
  'authenticated has no table-wide INSERT on short_links'
);

select ok(
  not has_table_privilege('authenticated', 'public.short_links', 'update'),
  'authenticated has no table-wide UPDATE on short_links'
);

select ok(
  not has_table_privilege('authenticated', 'public.short_links', 'delete'),
  'authenticated has no table-wide DELETE on short_links'
);

-- The owner-scoped read stays: signed-in list and analytics filter by `user_id`
-- and the policy is what keeps that row-scoped.
select ok(
  has_table_privilege('authenticated', 'public.short_links', 'select'),
  'authenticated keeps the table-wide SELECT grant, constrained by RLS'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'short_links'
      and policyname = 'short_links_read'
      and cmd = 'SELECT'
  ),
  'short_links_read still exists for the owner read'
);

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'short_links'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  ),
  'short_links has no write policy left'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.upsert_short_link(text,text,uuid,timestamptz,timestamptz,boolean,timestamptz,text,uuid,timestamptz)',
    'execute'
  ),
  'anon cannot execute upsert_short_link'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.upsert_short_link(text,text,uuid,timestamptz,timestamptz,boolean,timestamptz,text,uuid,timestamptz)',
    'execute'
  ),
  'authenticated cannot execute upsert_short_link'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.upsert_short_link(text,text,uuid,timestamptz,timestamptz,boolean,timestamptz,text,uuid,timestamptz)',
    'execute'
  ),
  'service_role keeps execute on upsert_short_link'
);

-- Granted writes are refused outright, and privilege checks run before row
-- filtering, so these raise even when the predicate matches no row. The inserts
-- use the pre-#460 bypass itself: `user_id = null` from an anonymous caller.

set local role authenticated;

select throws_ok(
  $$insert into public.short_links
      (code, original_url, user_id, created_at, updated_at)
    values ('RLSTEST-SL-1', 'https://example.invalid', '00000000-0000-0000-0000-000000000001', now(), now())$$,
  '42501',
  null,
  'an authenticated user cannot insert a short link'
);

select throws_ok(
  $$update public.short_links set original_url = 'https://example.invalid'
     where user_id = '00000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'an authenticated user cannot update a short link'
);

select throws_ok(
  $$delete from public.short_links
     where user_id = '00000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'an authenticated user cannot delete a short link'
);

select throws_ok(
  $$select public.upsert_short_link(
      'RLSTEST-SL-2', 'https://example.invalid',
      '00000000-0000-0000-0000-000000000001', now(), now(), false, null, null,
      gen_random_uuid(), null)$$,
  '42501',
  null,
  'an authenticated user cannot call upsert_short_link'
);

set local role anon;

select throws_ok(
  $$insert into public.short_links
      (code, original_url, user_id, created_at, updated_at)
    values ('RLSTEST-SL-3', 'https://example.invalid', null, now(), now())$$,
  '42501',
  null,
  'anon cannot insert a short link with a null user_id'
);

select throws_ok(
  $$select public.upsert_short_link(
      'RLSTEST-SL-4', 'https://example.invalid', null, now(), now(), false, null,
      null, gen_random_uuid(), null)$$,
  '42501',
  null,
  'anon cannot call upsert_short_link'
);

reset role;

select * from finish();

rollback;
