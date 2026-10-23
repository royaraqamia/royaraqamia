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
- `project_requests` and `retainers` are service-role only: a signed-in user cannot insert,
  and `anon` cannot read.
- `short_links` writes are service-role only: neither `anon` nor `authenticated` holds
  `INSERT`/`UPDATE`/`DELETE`, no write policy is left, and `upsert_short_link` refuses both
  roles while `service_role` keeps execute. The owner-scoped `short_links_read` stays.

`plan_cap_enforcement_test.sql` (#526):

- The count a cap reads excludes tombstones.
- A sixth habit is refused at the free cap, editing an existing row is not a new slot,
  reviving a tombstone at the cap is refused, deleting still works, and the freed slot
  accepts a revival.
- The Admin exemption holds at the cap, and a non-admin at the cap is refused.
- An eleventh published post is refused at the free cap.
- A client cannot write `status`, `published_at`, `community_visible`, `view_count` or
  `featured`; it keeps writing the editor-owned columns.
- `publish_post`, `unpublish_post`, `set_post_featured` and `bulk_publish_posts` move the
  server-owned columns for the owning author, refuse another account's post, and a batch
  that publishes an already published row takes no new slot.
- `anon` cannot execute `publish_post`.

In `rls_authorization_test.sql` every write attempt is expected to be _refused_, so a failed
rollback cannot leave data behind. `plan_cap_enforcement_test.sql` also writes rows to reach a
cap; it seeds them with `session_replication_role = replica` and rolls the whole file back.

## Status

Scaffolded 2026-09-17 and **not yet executed** — the CLI and a local stack were not
available when it was written. Expect the first run to need small adjustments. The
`is_admin()` assertions reflect behaviour verified directly against the project; the
certificate and `users` write assertions do not.

`plan_cap_enforcement_test.sql` was written the same way (2026-10-23, no Docker on the
writing machine), so treat its first run the same: the SQL it exercises is deployed by the
drift workflow on merge, but the assertions themselves are unrehearsed.

## Worth adding next

- Positive paths: an allowlisted Admin can insert, update and delete a certificate
  (needs a disposable stack, since these write).
- A non-admin cannot update or delete an existing certificate.
- Consultation booking policies, which currently have RLS enabled with no policies.
