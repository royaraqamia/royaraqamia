# RLS tests

Policy assertions for the authorization model, written as [pgTAP](https://pgtap.org/)
tests so `supabase test db` can run them.

## Running

```bash
supabase start     # local stack (needs Docker)
supabase test db   # runs every *.sql in this directory
```

These run against the **local stack only**. `pgtap` is available on the hosted project
but not installed there, and these tests deliberately assume `auth.uid()` and
`auth.jwt()` behave as they do locally.

## Why this exists

Nothing in the repo asserted policy behaviour, which is how a client-writable
`users.is_admin` column gated certificate writes for six weeks without anyone noticing.
Treat any change to a policy, a grant, or an `is_admin`-adjacent function as needing a
test here.

## What is covered

`rls_authorization_test.sql`:

- `is_admin()` is false with no email claim, false for a non-allowlisted email, and true
  for an allowlisted one.
- A signed-in non-admin cannot insert a certificate. The role holds the table-level
  `INSERT` grant, so the admin-only policy is what has to refuse it.
- A user cannot set their own `users.is_admin`, nor rewrite their own `users.email`.

Every write attempt in the file is expected to be _refused_, so a failed rollback cannot
leave data behind.

## Status

Scaffolded 2026-09-17 and **not yet executed** — the CLI and a local stack were not
available when it was written. Expect the first run to need small adjustments. The
`is_admin()` assertions reflect behaviour verified directly against the project; the
certificate and `users` write assertions do not.

## Worth adding next

- Positive paths: an allowlisted Admin can insert, update and delete a certificate
  (needs a disposable stack, since these write).
- A non-admin cannot update or delete an existing certificate.
- Consultation booking policies, which currently have RLS enabled with no policies.
