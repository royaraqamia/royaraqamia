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
- A re-publish keeps the post's original `published_at` — the feed orders by it, so a fresh
  date would float an old post back to the top — while a draft stamped into published gets
  one, and a mixed bulk batch stamps only the drafts (#552).
- `anon` cannot execute `publish_post`.

In `rls_authorization_test.sql` every write attempt is expected to be _refused_, so a failed
rollback cannot leave data behind. `plan_cap_enforcement_test.sql` also writes rows to reach a
cap; it seeds them with `session_replication_role = replica` and rolls the whole file back.

`habit_reminders_damascus_test.sql` (#604):

- The reminder window on the Damascus clock: 08:00 is due at 08:00:00 and 08:14:59, not at
  07:59:59 and not again at 08:15:00, and an unset reminder keeps the 07:00 default.
- The Damascus day starts at 21:00 UTC the day before, so a 01:00 reminder on the 27th is
  judged against a UTC date of the 26th.
- A completed log dated today in Damascus suppresses the reminder; one dated the previous
  Damascus day does not.
- The once-per-day dedupe reads the Damascus day: a second run in the same day sends nothing,
  and a reminder from the previous Damascus day does not suppress today's.
- `anon` cannot call the selection and `authenticated` cannot trigger the run.

It asserts through `habit_reminder_is_due` / `habit_reminders_due` with a pinned `p_now`, because
`send_daily_habit_reminders()` itself inserts notifications and posts to the push webhook.

`publish_news_digest_test.sql` (#602):

- A fresh day stores the stories the function was given, and the digest row carries that count.
- A run whose second story the table refuses rolls back the digest upsert, the delete of the previous
  stories and the count, so the day keeps exactly the digest a reader could see before it started.
- A successful re-run keeps the day's digest id, replaces its stories rather than appending, and sets
  `story_count` to what it stored.
- `anon` and `authenticated` cannot execute `publish_news_digest`; `service_role` can. It is
  `security definer` with a pinned `search_path`.

Its body was checked against the linked project inside a rolled-back transaction (the function, the
rollback path and the privileges), so only the pgTAP harness around it is unrehearsed.

`recurring_materialization_test.sql` (#618):

- Two recurring expenses with the same category, amount and day are two materialized rows, each
  carrying its own `client_id`.
- A hand-typed expense with the same user, category, amount and date does not suppress the
  recurring one.
- A second run in the same month adds nothing, and moving the recurring expense to another day of
  the same month does not either — the rows keep the date the first run gave them.
- An account on the free expense cap raises `PL001` and is skipped; the run returns normally and
  the next account in the loop is still materialized.
- A 31st-day recurring expense lands on the last day the month has.
- `anon` and `authenticated` cannot execute the materializer.

The `current_date` the function reads cannot be pinned, so the fixtures are anchored to whatever
month the suite runs in; the clamp assertion is a no-op arithmetic check in a 31-day month and a
real one in a shorter month.

## Status

Scaffolded 2026-09-17 and **not yet executed** — the CLI and a local stack were not
available when it was written. Expect the first run to need small adjustments. The
`is_admin()` assertions reflect behaviour verified directly against the project; the
certificate and `users` write assertions do not.

`plan_cap_enforcement_test.sql` was written the same way (2026-10-23, no Docker on the
writing machine), so treat its first run the same: the SQL it exercises is deployed by the
drift workflow on merge, but the assertions themselves are unrehearsed.

`habit_reminders_damascus_test.sql` (#604) is in the same position, with one difference: its
helper boundaries, its selection body and every fixture's statement shape were run against the
linked project as read-only queries (`db query`, `explain`), so the arithmetic and the columns are
verified. The pgTAP harness around them still needs `supabase test db`.

`recurring_materialization_test.sql` (#618) is the same: the migration's function body was created
and its `insert … on conflict (user_id, client_id)` planned against the linked project inside a
rolled-back transaction, and the deterministic `client_id` expression was evaluated there. The
fixtures (an `auth.users` row per owner, an expense list at the cap) still need a local stack.

## Worth adding next

- Positive paths: an allowlisted Admin can insert, update and delete a certificate
  (needs a disposable stack, since these write).
- A non-admin cannot update or delete an existing certificate.
- Consultation booking policies, which currently have RLS enabled with no policies.
