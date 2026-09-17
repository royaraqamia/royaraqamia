-- RLS assertions for the authorization model.
-- Run with `supabase test db` against the local stack - see README.md.
--
-- Every write attempted here is expected to be refused, so a failed rollback cannot
-- leave data behind. Positive-path writes belong in a disposable stack.

begin;

create extension if not exists pgtap;

select plan(6);

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

reset role;

select * from finish();

rollback;
