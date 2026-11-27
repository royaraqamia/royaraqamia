# Supabase & Migrations

## Local development workflow

```bash
supabase start          # Start local stack
supabase db push        # Push local changes
supabase migration new  # Create new migration
```

## CI agent workflow (MCP connected)

When the agent has Supabase MCP access:

- Inspect live project: `list_tables`, `list_migrations`, `get_advisors`, logs
- Apply schema changes **only** through `apply_migration`
- **Mirror discipline:** `apply_migration` assigns the version timestamp itself — you cannot choose it, so the `name` you pass is only a suffix. Apply first, read the version back (`list_migrations`, or `select version, name from supabase_migrations.schema_migrations order by version desc limit 1`), then name the local file `<version>_<name>.sql`. The recorded `statements` contain only the SQL you passed, not the file's comment header, so the repo file is deliberately richer than the remote history. Drift here is silent — compare the two lists by version.

## Agent verification (local CLI)

MCP is not required for the live checks. `supabase` is a devDependency, so `npx supabase` works from the repo root, and the project is already linked (`supabase/.temp/project-ref` holds the ref; the whole `.temp/` is gitignored):

```bash
npx supabase migration list --linked        # repo files vs the project's recorded versions
npx supabase db push --linked --dry-run     # exactly what a merge would apply
npx supabase db query --linked "select ..." # or -f <file.sql>; runs through the Management API
npx supabase db advisors --linked           # security + performance, the `get_advisors` equivalent
```

`db query` is how an acceptance criterion gets checked against reality — a function's `prosecdef`/`proconfig`/`proacl`, a `cron.job` row, row counts — and `db advisors --type security` is the advisor run. Use `npx supabase` rather than a global install: it runs the version pinned in `package.json`, which is the version CI pins too.

A merged migration needs no hand-applying: the merge **is** the apply. The Supabase GitHub integration applies it on the push to `main`; the drift workflow is ordered plan → vet → wait → verify (see "Applying" below), so what is left to the agent after a merge is the verification, not the apply.

## Migrations convention

- Incremental timestamped files in `supabase/migrations/`, applied in filename order
- **Never edit an applied migration**
- **A new file takes a version after every one already recorded.** The stamps are a sequence, not a
  calendar — `20261115120000` was applied on 2026-11-10 — so the number to beat is the project's
  newest, not the hour you are writing in. `supabase db push` refuses a file that sorts behind it
  ("inserted before the last migration on remote database") and names it with `--include-all`, which
  is not the answer: renumber the file. `scripts/check-migration-drift.mjs` fails a pull request that
  adds one (`outOfOrderPending`), so it is caught before the merge.
- Base schema lives on remote project (first migration `20260718105449` is an intentional stub) — add new changes as NEW files only
- Prefer additive, reversible migrations; include a rollback note in the PR body
- A migration that creates a table, view or sequence in `public` grants the roles that need it in the
  same file — see [New public objects need explicit grants](#new-public-objects-need-explicit-grants)

## New public objects need explicit grants

Since **2026-10-30** Supabase no longer applies its default grants to objects created in the `public`
schema. A new table, view or sequence is reachable through the Data API only if the migration grants
the role itself; without one, every request — including through the service-role client — fails with
`42501 permission denied`. Existing tables keep the grants they already have, so nothing needs to be
backfilled. A from-scratch replay is not how this repo works anyway: the base schema lives on the
project and the first migration is a stub.

- **RLS is not access control.** Policies choose rows; grants decide whether the role reaches the
  object at all. A table with perfect policies and no grant is invisible. The stale default ACL
  rows from before 2026-10-30 are cleared by 20261224000000, and the same migration strips
  TRUNCATE, REFERENCES, TRIGGER and MAINTAIN from `anon`/`authenticated` on the existing tables:
  RLS does not apply to TRUNCATE, so the privilege itself has to go (#1741). The platform owner's
  (`supabase_admin`) default-ACL row is the one a migration may not be able to change; where the
  grantor is not manageable the migration reports it instead of failing.
- **A function a policy calls needs `execute` for the calling role.** A policy expression runs with
  the privileges of whoever queries the table, so `security definer` on the helper decides whose
  rights its body runs with, not who may call it. Revoking execute from `authenticated` leaves the
  policy — and every read or write it guards — failing with
  `42501 permission denied for function ...` before RLS decides anything (the chats #811 regression).
- **`service_role` needs a grant too.** It bypasses row level security, not privileges. A server-written
  table without `grant all ... to service_role` fails on its first write from the admin client, a cron
  job or a workflow.
- Grant only what the object serves:

```sql
-- public read, server writes (the news digest)
grant select on public.news_digests to anon, authenticated;
grant all on public.news_digests to service_role;

-- signed-in users read and write their own rows
grant select, insert, update, delete on public.quran_bookmarks to authenticated;

-- views read like tables; sequences have their own grant (only `serial`, not `identity`)
grant select on public.widget_summary to anon, authenticated;
grant usage, select on sequence public.widgets_id_seq to authenticated;
```

The gate runs in two places: `scripts/check-migration-grants.mjs` vets the migrations a pull request
adds or edits, and `scripts/check-migration-safety.mjs` refuses to apply a pending migration that
creates a `public` object with no grant. Both read the files only. An `apply_migration` through MCP
bypasses them, so the grant belongs in the statement list applied there **and** in the mirrored file.

## Drift check and apply

`supabase/migrations/` and the linked project's `supabase_migrations.schema_migrations` are compared
in CI: `.github/workflows/migration-drift.yml` runs `scripts/check-migration-drift.mjs` on pull
requests and pushes that touch migrations, nightly, and on demand. A pull-request run is only a
check; every other run also reconciles one `opencode:alert` tracking issue — it opens when the job
fails (an out-of-band `apply_migration` has no pull request here to comment on) and closes it as soon
as the two sides agree again. Run it by hand with the two variables the agent workflows already use:

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npm run check:migrations
```

It fails in both directions, and says which one it found:

| Finding                                                | What it means                                                                                                                                                                                | What to do                                                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A file the project has no version for                  | Production is behind the repo, so deployed code may expect schema that is not there. On a pull request this is a notice — the integration applies what the pull request adds after the merge | On `main` the integration applies it and the job waits for that check; to recover, dispatch with `apply: true` or run `supabase db push` by hand, then re-run the check |
| A pending file that sorts before the project's newest  | `supabase db push` will not insert history in the middle of the list it has written past, so the file never applies — on a pull request this is a failure, not a notice                      | Rename the file to a version after the project's newest and push; nothing else applies it                                                                               |
| A recorded version with no file                        | Production is ahead: schema or a policy was applied out of band, unreviewed, with no migration file to roll it back                                                                          | Add the file the project is missing, or, once you have decided production is wrong, revert the record with `supabase migration repair --status reverted <version>`      |
| It cannot read the history (non-2xx, or an empty list) | Wrong `SUPABASE_PROJECT_REF`, an expired token, or a changed API shape                                                                                                                       | Fix the credential. The check deliberately refuses to report "in sync" when it cannot look                                                                              |

### Applying

On `main` the job is ordered plan → vet → wait → verify, so a migration that was merged (and
therefore reviewed) still lands in production without anyone driving it:

- **Plan:** `supabase db push --linked --dry-run` prints exactly what a merge would apply. It needs
  nothing but `SUPABASE_ACCESS_TOKEN`, and it reports rather than gates.
- **Vet:** `scripts/check-migration-safety.mjs` reads the pending files and refuses the whole run if
  any of them drops a table or column, truncates, turns row level security off, writes to `auth.users`
  or Storage, drops an object it does not recreate, or deletes rows without a `WHERE`. A dropped
  policy counts as recreated when the same file creates a policy on the same table — the shape of a
  merge that folds two permissive policies into one. Those are the
  entries in "Forbidden without explicit human approval" below, and they stay pending: a person reads
  the file and applies it with `supabase db push` after approving it.
- **Apply:** the Supabase GitHub integration applies the pending files on the push to `main` and is
  the only applier there. This workflow used to run `supabase db push --linked --yes` on that push
  too; two appliers raced on `supabase_migrations.schema_migrations` and the loser died with
  `23505 duplicate key value violates unique constraint "schema_migrations_pkey"`. The Supabase
  Preview check on commit `97f39d4` (2026-11-22) lost that race to `20261225000000` after CI's
  apply had recorded the version. Applying from this workflow is now a manual recovery
  (`workflow_dispatch` with `apply: true`), still with `SUPABASE_ACCESS_TOKEN` — enough for the CLI
  to mint a login role — and `SUPABASE_DB_PASSWORD` when the repository has one.
- **Wait:** on a push the workflow waits for the integration's `Supabase Preview` check to finish,
  so the verify step never reads a history the applier has yet to write. A failed or missing check
  is not papered over: it leaves the migration pending and the strict verify fails.
- **Verify:** the drift check runs strictly afterwards, so "it applied" is not a claim: the project's
  recorded versions are read back and compared.

**A branch that reads a new column is red until the project has it.** The build prerenders routes
that read through the admin client (`/community`, for one), so a pull request whose code filters on a
column the linked project does not have yet fails `Build` — and the offline suite too, on the pages
those reads feed — with `column users.<name> does not exist` (`42703`). A pull-request drift run only
notices the pending file. Apply it by hand before expecting green:

```bash
npx supabase db push --linked --dry-run   # what a merge would apply
npx supabase db push --linked --yes
```

The merge is still what applies a migration nobody applied early; doing it on the branch only moves
the same reviewed file earlier, and the `main` run finds nothing left to do.

`workflow_dispatch` takes `project-ref` (compare against another project) and `apply` (apply now
rather than wait for the next push). The alert path is drillable without touching production:
`gh workflow run 'Migration Drift' -f project-ref=<a ref that does not exist>` opens the tracking
issue, and a second dispatch with no input closes it.

A file the project must never have goes into `KNOWN_LOCAL_ONLY`, and an
intentional project-only version into `KNOWN_REMOTE_ONLY` — both at the top of the
drift script, next to the reason. Neither list holds anything today. One caveat
learned the hard way: `supabase db push` refuses to run at all when the project
records a version the repo has no file for, so the answer to an orphaned version
is a file at that version rather than an entry in `KNOWN_REMOTE_ONLY`. The lists
are for the detector, and the CLI has its own opinion. The first run (PR #217,
2026-10-14) compared 108 repo files against 108 recorded versions and found no
asymmetry, the base-schema stub included. The check compares version ids
only, so editing an applied migration stays invisible to it: this is a detector,
not a review. See ADR 0040 (the check) and ADR 0041 (the apply).

## Forbidden without explicit human approval

- Destructive DDL (`DROP TABLE/COLUMN`, `TRUNCATE`)
- Disabling or weakening RLS
- Modifying `auth.users` data
- Storage bucket changes
- Data backfills over user tables

## Attachment allowances (Free-plan period)

Chat attachments are capped on the server while both providers are on Free: Supabase gives a
project **1 GB of file storage in total** and Vercel Hobby caps CPU at 4 hours, and one 24 MB file
would be 2.4% of that storage. Text is not the pressure point (~1 KB per message with its indexes),
so the caps are on files (ADR-0113, #852).

| Lever              | Free                                  | After Pro |
| ------------------ | ------------------------------------- | --------- |
| Per file           | 10 MB                                 | 25 MB     |
| Per member per day | 50 MB, reset at Damascus midnight     | none      |
| Per member total   | 100 MB                                | 1 GB      |
| Project total      | 500 MB — files refuse, text continues | —         |

- The four numbers are columns on the `app_settings` singleton (`chat_attachment_file_bytes`,
  `…_daily_bytes`, `…_member_bytes`, `…_project_bytes`), so raising them after Pro is one `update`
  — no deploy, no migration. `private.enforce_chat_attachment_quota` reads them on every insert and
  answers `53400` with a distinct sentence per cap; `public.chat_attachment_allowance()` is what the
  composer draws.
- **The bucket is the exception**: Storage enforces `file_size_limit` from the bucket row, which
  cannot read `app_settings`. Raising the per-file cap therefore needs a migration that updates
  `storage.buckets` alongside the setting.
- The 25 MB in `shared/contracts/chat.ts` (`CHAT_ATTACHMENT_MAX_BYTES`) is the absolute ceiling a
  deployment may configure, not the effective cap.

## Post image allowances

`post-images` now has the same two storage meters as chat (issue #1691): 100 MB per member and
500 MB project-wide, both columns on `app_settings` (`post_image_member_bytes`,
`post_image_project_bytes`). The 5 MB `file_size_limit` on the bucket still bounds one file;
these bound the count. `private.enforce_post_image_quota` fires when Storage records an object's
size, so the bytes it sums are the ones Storage kept rather than the upload's declared size.
`public.post_image_allowance()` is the service's preflight, and the service deletes an object when
the post that referenced it is tombstoned or its cover is replaced. The chat caps are unchanged;
the two paths still have separate triggers.

## Operations

- **pgvector:** `agent_memory_embeddings_1024` holds one vector per saved fact, in
  `extensions.vector(1024)` (20261210120000, ADR-0185 decision 6, ADR-0200). The
  width is the generation: a model of another width is a new table and
  `npm run embeddings:backfill`, never an in-place reindex, and until the new
  table exists the embedding path stays off with one operator warning. The
  pending view, `agent_embedding_pending`, is the one definition of "waiting",
  including a fact edited after its vector was built. The 1536 generation
  (`agent_memory_embeddings`) and its function are gone, dropped by
  20261211120000 once the backfill reported `done` and a person approved it
  (#1554); `agent_memory_forget` and `agent_memory_forget_thread` were rewritten
  in the same file, because a body that still named the old table would have
  failed at the forget buttons.

- **Advisors:** Run `supabase_get_advisors` (security + performance) after schema changes
- **Deliberate advisor findings:** `unindexed_foreign_keys` names the `user_id` columns on `training_applications`, `consultation_bookings`, `project_requests` and `retainers`. They carry no index on purpose — nothing reads them yet (ADR-0005), and an index only pays for reads. `training_applications` dedupes on its own `user_id`, so if that ever becomes slow, index all four together rather than only the newest two. `rate_sync_runs.snapshot_id`
  was listed here for the same reason — written once per sync, read by status and recency, never by
  snapshot — and 20261031180000 indexed it with the rest of the list (#738): a parent-side scan is a
  scan whether or not a read orders by the column. No read filters on it and nothing deletes a
  snapshot today, so it is write-only cost; drop it if that ever matters more than covering the whole
  advisor list. `idx_rate_sync_runs_started_at` is the one deliberate `unused_index`: the health read
  (`getLastSuccessfulRun`) filters on `status` and orders by `finished_at`, which
  `idx_rate_sync_runs_status_finished` now serves, but `started_at` is still selected and mapped into
  `RateSyncRun`, and dropping the index alone is a destructive statement the apply gate keeps behind
  a human (20261019130000).
- **Deliberate security advisories:**
  - `extension_in_public` for `pg_trgm` — fixed by moving it to the non-exposed `extensions`
    schema (20261011110000); relocatable, and the ILIKE GIN indexes reference `gin_trgm_ops`
    by OID so they are unaffected.
  - `extension_in_public` for `pg_net` — **not** relocatable (`extrelocatable = false`; its
    functions already live in the non-exposed `net` schema), so an `ALTER EXTENSION ... SET SCHEMA`
    move fails and the issue's proposed relocation is not an option. Moving it would also risk the
    habit-reminder and workflow-dispatch webhooks that call `net.http_post`. The
    exposure is closed by revoking `EXECUTE` from `public`/`anon`/`authenticated`
    (20260917082727), reaffirmed across **every** `net.*` function by 20261224000000 so a new
    overload from an extension upgrade cannot reopen it. The SECURITY DEFINER callers run as the
    function owner and keep their path.
  - `authenticated_security_definer_function_executable` — resolved where it mattered:
    - `public.is_admin()` moved to the non-exposed `private` schema (20261011130000), so the
      `/rpc/is_admin` route is gone; the three certificate policies call `private.is_admin()`.
    - the SpendTrack aggregates (`get_total_expenses`, `get_daily_totals`,
      `get_category_breakdown`) switched to `SECURITY INVOKER` (20261011120000) — they are only
      ever called with the user-scoped session client and their RLS is own-row ("own + defaults"
      for categories), so the existing `auth.uid()` guard keeps results identical without the
      definer bypass.
    - `list_available_consultation_slots` is the one remaining, deliberate finding: it **must**
      stay `SECURITY DEFINER` because it reads `consultation_booking_slots`, which has RLS
      enabled with no policies (deny-all), so an `INVOKER` version would treat every slot as
      free. It is the booking flow's client read and is revoked from `anon`/`public`.
  - `anon_security_definer_function_executable` on `post_engagement_counts` and
    `follow_counts` is deliberate (20261220000000, #1690). Both edge tables are ungranted
    to `anon`, so a signed-out feed card or profile header can only draw the number
    through a definer function; revoking the grant would delete the feature. Each body
    now filters to the public projection - a published, community-visible, live post
    and a verified, unhidden member - and
    `supabase/tests/counter_rpc_visibility_test.sql` asserts both directions.
  - `auth_leaked_password_protection` — **cannot be enabled on the current plan.** Supabase's
    HaveIBeenPwned check is Pro-plan-and-up only (the Management API rejects
    `password_hibp_enabled` with "available on Pro Plans and up"). The app enforces the check
    itself instead (`backend/clients/password-breach.ts`, HIBP k-anonymity, applied at signup
    and password set, gated by `passwordBreachCheckEnabled`). Re-evaluate if the project moves
    to Pro.
- **RLS testing:** Verify policies with `supabase list_tables verbose=true`
- **Edge functions:** `supabase functions deploy <name>` (`verify_jwt=true` by default)
- **Backups/Point-in-time:** the free plan has neither — see [Backup and restore](#backup-and-restore)

## Backup and restore

The production project is on the free plan. Supabase backs up Pro, Team and
Enterprise projects daily and sells PITR as an add-on; on this project the
Management API reports `backups: []` and `pitr_enabled: false` (measured
2026-11-21, #1700). There is no platform restore point. The recovery contract
is the artifact plus a drill, not a plan in prose.

**Artifact.** `.github/workflows/database-backup.yml` runs daily at 02:00 UTC.
With CLI v3 it uses `--remote=<project ref>` and `SUPABASE_ACCESS_TOKEN` — the
CLI mints a temporary login role, so no database-password secret is needed —
and writes five files: `roles.sql`, `schema.sql`, `data.sql` (COPY data), and
the `supabase_migrations` schema and data. `scripts/verify-database-dump.mjs`
fails the run when any file is missing, below its size floor, or when any of
the five recorded tables is below its row floor; the floors live in
`scripts/backup-contract.mjs`. The verified directory is compressed, uploaded
to a dedicated R2 bucket under `database/`, and checked by re-downloading it.
A failed upload is a red job with a Telegram notice, and the job publishes the
archive name as the repository variable `LATEST_DB_BACKUP`, which is how the
drill finds it — the scoped token cannot list objects. Thirty-day retention comes
from an R2 **lifecycle rule** on the bucket — prefix `database/`, expire objects
after 30 days — set up once in the dashboard; the workflow prunes older objects
too when the token can list them, and warns when it cannot.

**One-time setup.** Create a dedicated R2 bucket (not the audio bucket), mint a
token scoped to object read/write/list/delete under `database/`, and add the
secrets `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and
`R2_BACKUP_BUCKET`. The drill also needs `SCRATCH_DB_URL`. Until they exist the
jobs fail closed rather than report a backup that was never stored.

**Recovery point.** Rows have a 24-hour RPO at this size: the newest successful
daily dump is the restore point. Storage bytes are outside that contract — see
the Storage decision below.

**Storage RPO — decision.** Database dumps never contain Storage objects. The
four buckets `avatars`, `post-images`, `android` and `chat-attachments` are
outside every backup, paid or free. Their bytes may be lost: the RPO for
objects is unbounded, and this is accepted at the current scale. Concretely, a
restored `chat_attachments` row whose object is gone shows the message with a
file that will not open; the nightly sweep does not remove the row because its
path is still referenced. A periodic copy of those four buckets would be an
addition to this contract, with its own recorded RPO — it is not a substitute
for the drill.

**Restore procedure.** Never restore into production.

1. Create a scratch Supabase project and get its direct Postgres connection
   string. Enable the extensions and Database Webhooks the source uses.
2. If Vault or pgsodium columns are in use, copy the root encryption key from
   the source **before** pausing or deleting it: read it with
   `GET https://api.supabase.com/v1/projects/$OLD_REF/pgsodium` and write the
   same 64-character hex value to the new project with `PUT .../pgsodium`.
   Backups hold ciphertext, not the key.
3. Download the newest archive from R2 and unpack it into a directory.
4. Empty every schema the archive restores, not just `public`: it also holds
   `auth`, `storage` and the rest of the Supabase schemas, so a reset that
   touches `public` alone leaves `auth.flow_state` behind and the next replay
   dies on `flow_state_pkey` (#1954). `node scripts/restore-database.mjs` does
   this itself — it reads the schema list out of the artifact, drops each with
   `CASCADE`, re-creates and re-grants `public`, drops the roles `roles.sql`
   will create, and refuses to replay if a table is left in those schemas.
   By hand, that is:
   `drop schema if exists auth cascade;` for each schema the dump creates, then
   `create schema if not exists public;` and
   `grant all on schema public to postgres, anon, authenticated, service_role;`,
   then `drop role if exists cli_login_postgres;`.
5. Replay the dump with psql, in this order:

   ```sh
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql --dbname "$SCRATCH_DB_URL"

   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file history_schema.sql --file history_data.sql --dbname "$SCRATCH_DB_URL"
   ```

6. Verify with `node scripts/restore-database.mjs --dir <dir> --db-url "$SCRATCH_DB_URL"`.
   It replays the same files, compares every restored count against the
   artifact's manifest and its floor, and exits non-zero on any mismatch. The
   monthly `.github/workflows/database-restore-drill.yml` runs this end to end
   and records the pass date and duration in its job summary.
7. Custom roles with `LOGIN` need new passwords after a restore — backups do
   not store them. Supabase handles its own Realtime slot on a platform restore;
   for a logical restore, re-enable the Database publications the app needs.
   If `roles.sql` grants `postgres` to `cli_login_postgres` and psql refuses,
   remove that one grant line and let the CLI recreate the role.

**Measured RTO.** The first live drill passed on 2026-11-21, replaying artifact
`royaraqamia-db-20261121T170859Z.tar.gz` into the scratch project ([run
44929568366](https://github.com/royaraqamia/royaraqamia/actions/runs/44929568366)).
The psql replay plus row-count verification took **276s**; the whole job,
including download and database reset, took **4m58s**. Restored counts matched
the artifact exactly: `public.users` 24, `public.notifications` 11225,
`public.chat_messages` 97, `public.chat_attachments` 8 and
`supabase_migrations.schema_migrations` 257. The monthly drill repeats this and
records each pass in its job summary; a later duration replaces this one only
when another green run produces it.

A repeat drill on 2026-11-27 failed at `COPY flow_state, line 1` with a duplicate
key: the reset emptied `public` while the archive also restores `auth`, so the
second run landed on the first run's rows (#1954). The drill now derives the
schemas to empty from the artifact and asserts they are empty before replaying,
so this failure names the schema instead of surfacing as a constraint violation.

## Data & access control

- Database: Supabase (PostgreSQL 17, Auth, Storage, Realtime)
- RLS on tables; admin-only writes via `ADMIN_EMAILS` allowlist + `backend/shared/admin-validator`
- Service-role key is server-only, never in the browser
