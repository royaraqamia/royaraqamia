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
- A sixth published post is refused at the free cap.
- A free reader cannot save more than five news sources, and a visitor cannot create a
  second live anonymous link (ADR-0093).
- A client cannot write `status`, `published_at`, `community_visible`, `view_count` or
  `featured`; it keeps writing the editor-owned columns.
- `publish_post`, `unpublish_post`, `set_post_featured` and `bulk_publish_posts` move the
  server-owned columns for the owning author, refuse another account's post, and a batch
  that publishes an already published row takes no new slot.
- A visitor with no cookie is counted by their salted address alone (#701): the first
  request records one event, the second is refused by the visitor cap rather than raising
  `22023`, the row carries the hash and no cookie, an IP-only replay dedupes, and a subject
  with neither a user, a cookie nor an address is still refused.
- A re-publish keeps the post's original `published_at` — the feed orders by it, so a fresh
  date would float an old post back to the top — while a draft stamped into published gets
  one, and a mixed bulk batch stamps only the drafts (#552).
- `anon` cannot execute `publish_post`.

`plan_reads_test.sql`:

- `get_owned_item_states` answers for a Free member, one row per `plan_limits` row, and every
  `plan_limits` key has a branch in `private.owned_item_count` — the read that broke
  `/account/plan` for every account when the switch lost `mcp_connected_apps`.
- An Admin's owned-item caps read as the unlimited placeholder and `get_usage_counters` reports
  `unlimited`.
- `chat_agent_allowance` answers an Admin as `pro` with the Pro cap, a live Pro activation as
  `pro`, and a Free member as `free` with no allowance.
- `record_usage` lets an Admin's assistant turn through and still refuses a Free member's.

In `rls_authorization_test.sql` every write attempt is expected to be _refused_, so a failed
rollback cannot leave data behind. `plan_cap_enforcement_test.sql` also writes rows to reach a
cap; it seeds them with `session_replication_role = replica` and rolls the whole file back.

`chats_test.sql` (#843, ADR-0113):

- A message older than fifteen minutes can be tombstoned: the window bounds an edit, not a
  delete.
- The tombstone clears the body in the same write and does not stamp `edited_at`.
- A second tombstone changes no row, so the repository tells the client no row changed instead
  of reporting a success the refresh undoes.
- A body change past the window raises `42501`; one inside it is stored and stamps `edited_at`.
- A tombstone is final: the body cannot come back and `deleted_at` cannot be cleared.
- A member can neither edit nor tombstone the other side of the thread, and a message keeps its
  identity.

`chat_direct_key_test.sql` (#841, ADR-0113):

- A direct thread with two roster rows is keyed by the sorted pair, and one with a single row
  carries no key — the guard that keeps `startDirect`'s intermediate state and a thread missing a
  roster row out of the unique index.
- A decline keeps the pair as the key, the pair lookup still answers the declined thread, and a
  second direct thread for the pair is refused (`23505`).
- A withdrawal (`left` on both rows) keeps the pair as the key and the index still refuses a second
  thread; reopening either status keeps the same conversation and the same key.
- The fixtures run with the status and pair-key triggers live, which is why this file does not seed
  with `session_replication_role = replica`.

`chat_agent_thread_test.sql` (#890, ADR-0113):

- The first `kind = 'agent'` conversation for a member is accepted and a second one for the same
  `created_by` is refused with `23505`, leaving the first in place — the trigger that makes two
  concurrent opens answer one thread.
- A group and a direct thread by the same member, and an assistant thread for another member, are
  unaffected.
- The fixtures run with the trigger live; the file rolls back.

`chat_participants_test.sql` (#840, ADR-0113):

- The creator of a direct thread adds their one peer as `requested`; a second add, or a third
  participant, is refused by the database, and the refusal leaves the same two rows.
- An active member cannot move their own row back to `requested` (which would freeze the thread for
  both sides), cannot answer a request they already accepted, and cannot grant themselves `owner`.
- `joined_at` only moves with a legal status change, and `last_read_at` still moves on its own at
  any status.
- A `declined` participant cannot rejoin without consent; an agent thread admits nobody but its
  owner; an invited member cannot invite anyone else.
- The SECURITY DEFINER `request_chat_conversation` and `withdraw_chat_request` still reopen and
  close a thread, including one whose rows are `left`.
- A member who left reads their own roster row and the thread, but none of their peers' rows or
  read watermarks (#888); a `requested` recipient and an active member still read the whole roster.
- `chat_direct_peer()` answers the other side of a two-row direct thread, `null` for a group, a
  stranger or an unanswered row, and only `authenticated` may execute it; the private roster helper
  is not executable by `anon`.
- A client cannot DELETE a roster row.

`chat_groups_test.sql` (#814, ADR-0113):

- The owned-item cap: three groups are allowed on Free, a fourth raises `PL001`, and a direct thread
  opened while at the cap is not refused — a group is the only kind that takes a group slot.
- Leaving is the exit that frees the slot: a `left` roster row drops the count back, and the freed
  slot accepts the next group.
- The member ceiling: thirty-two live roster rows fit in a group, the thirty-third invite raises
  `CH001`, and a declined row frees the seat the next invite takes.
- A member cannot add somebody else as `active`, a non-member cannot invite at all, and a
  non-member reads no roster row.

`chat_attachments_test.sql` (#815, #887, ADR-0113):

- A row whose `storage_path` names another conversation, or skips the thread folder, is refused
  with `42501` — the path guard, so a signed URL can never be minted for a path the row invented.
- A member reads and uploads inside their own thread's folder; a non-member reads nothing there
  and cannot upload into it.
- The row is deletable by its uploader only, which is what a tombstone needs.
- The object is deletable by its uploader only too (#887): another member's delete removes nothing
  and the peer's object is still there to sign, while an uploader removes their own object —
  including one whose row was never written, the failed-send cleanup's path.
- The composer's allowance (`chat_attachment_bytes_used()`) answers the caller's own bytes.

`chat_attachment_allowances_test.sql` (#852, ADR-0113):

- The four caps each refuse with their own text: the file above the configured size, the day
  (Damascus midnight), the member's total, and the project's wall.
- The caps are values in `app_settings`, so the file shrinks them to bytes and asserts the
  arithmetic instead of megabytes; a row dated two days ago counts against the total and not
  against today, which is what separates the two refusals.
- The bucket's own limit is the configured file cap, so Storage refuses an oversized object
  before the trigger is reached.
- `chat_attachment_allowance()` answers the caller's day and total plus the project's, which is
  what the composer draws.

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
drift workflow on merge, but the assertions themselves are unrehearsed. Its #701 block is the
exception: the migration and those assertions ran against the linked project inside a
rolled-back transaction, so only the pgTAP harness around them is unrehearsed. The
news-source pair added on 2026-11-05 (the digest flag beside a grandfathered selection
succeeds, a seventh source on that row is still `PL001`) is in the same position: both
statements ran against the linked project's over-cap row inside a rolled-back transaction,
and `20261115120000` applied in full there the same way.

`habit_reminders_damascus_test.sql` (#604) is in the same position, with one difference: its
helper boundaries, its selection body and every fixture's statement shape were run against the
linked project as read-only queries (`db query`, `explain`), so the arithmetic and the columns are
verified. The pgTAP harness around them still needs `supabase test db`.

`recurring_materialization_test.sql` (#618) is the same: the migration's function body was created
and its `insert … on conflict (user_id, client_id)` planned against the linked project inside a
rolled-back transaction, and the deterministic `client_id` expression was evaluated there. The
fixtures (an `auth.users` row per owner, an expense list at the cap) still need a local stack.

`plan_reads_test.sql` was rehearsed against the linked project inside a rolled-back transaction
(the two function bodies, every assertion's arithmetic and the Admin exemption), so only the
pgTAP harness around it needs `supabase test db`.

`chats_test.sql` (#843) is in the same position: no Docker on the writing machine, so the guard, the
policy and the fixtures are unrun. Its shapes mirror `plan_cap_enforcement_test.sql` (replica-role
fixtures, a rolled-back file, one `set local role authenticated` block), which is the closest
available rehearsal.

`chat_attachments_test.sql` (#815) is unrun for the same reason. It is the first assertion here
against `storage.objects`, so expect its first real run to need the storage triggers' own `NOT NULL`
columns filled in.

`chat_attachment_allowances_test.sql` (#852) is unrun too. Its arithmetic is checked by hand in the
comments beside each assertion; the risk is the settings update between role switches, not the caps.

`chat_participants_test.sql` (#840) is unrun for the same reason. The parts most likely to need a
first-run adjustment are the `current_user` owner check inside the guard (it compares against
`pg_class.relowner`, not a literal role name) and the direct pair keys the triggers write while the
file runs.

`chat_direct_key_test.sql` (#841) is unrun too, and it seeds with the status trigger live instead of
`replica`, so the trigger writes the keys the file is about: if `plan(17)` and the run disagree, the
fixture order (two rows before the first assertion) is the place to look first.

`chat_groups_test.sql` (#814) is unrun for the same reason. The parts most likely to need a first-run
adjustment are the `generate_series` user fixtures (a `users` column the local stack fills that this
file does not) and the thirty-row invite loop, which relies on the advisory lock being transaction
scoped.

`chat_agent_thread_test.sql` (#890) is unrun too, and it is the second file here that seeds with its
own trigger live. If `plan(6)` and the run disagree, the second agent insert is the place to look:
the refusal depends on the trigger seeing the row the same transaction wrote just before it.

## Worth adding next

- Positive paths: an allowlisted Admin can insert, update and delete a certificate
  (needs a disposable stack, since these write).
- A non-admin cannot update or delete an existing certificate.
- Consultation booking policies, which currently have RLS enabled with no policies.
