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

A merged migration needs no hand-applying: the merge **is** the apply. The `main` run of the drift workflow is ordered plan → vet → apply → verify (see "Applying" below), so the migration is live once that run goes green — what is left to the agent after a merge is the verification, not the apply.

## Migrations convention

- Incremental timestamped files in `supabase/migrations/`, applied in filename order
- **Never edit an applied migration**
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
  object at all. A table with perfect policies and no grant is invisible.
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

| Finding                                                | What it means                                                                                                                                                     | What to do                                                                                                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A file the project has no version for                  | Production is behind the repo, so deployed code may expect schema that is not there. On a pull request this is a notice — main applies what the pull request adds | On `main` the job applies it (the CLI mints its own login role from the access token); by hand, `supabase db push`, then re-run the check                          |
| A recorded version with no file                        | Production is ahead: schema or a policy was applied out of band, unreviewed, with no migration file to roll it back                                               | Add the file the project is missing, or, once you have decided production is wrong, revert the record with `supabase migration repair --status reverted <version>` |
| It cannot read the history (non-2xx, or an empty list) | Wrong `SUPABASE_PROJECT_REF`, an expired token, or a changed API shape                                                                                            | Fix the credential. The check deliberately refuses to report "in sync" when it cannot look                                                                         |

### Applying

On `main` the job is ordered plan → vet → apply → verify, so a migration that was merged (and
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
- **Apply:** `supabase db push --linked --yes`. It runs on `SUPABASE_ACCESS_TOKEN`, which is enough for the CLI to mint a login role for the linked project — the plan step above proves that connection with the same credentials on every push. `SUPABASE_DB_PASSWORD` is passed through when the repository has one, which is the path the CLI's own documentation recommends for CI. If the apply cannot connect or write, the verify step below reports the migration as still pending and the alert issue links to the run.
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

## Operations

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
    functions already live in the non-exposed `net` schema), and moving it would risk the
    habit-reminder and workflow-dispatch webhooks that call `net.http_post`. The exposure is
    closed by revoking `EXECUTE` from `public`/`anon`/`authenticated` (20260917082727).
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
  - `auth_leaked_password_protection` — **cannot be enabled on the current plan.** Supabase's
    HaveIBeenPwned check is Pro-plan-and-up only (the Management API rejects
    `password_hibp_enabled` with "available on Pro Plans and up"). The app enforces the check
    itself instead (`backend/clients/password-breach.ts`, HIBP k-anonymity, applied at signup
    and password set, gated by `passwordBreachCheckEnabled`). Re-evaluate if the project moves
    to Pro.
- **RLS testing:** Verify policies with `supabase list_tables verbose=true`
- **Edge functions:** `supabase functions deploy <name>` (`verify_jwt=true` by default)
- **Backups/Point-in-time:** Configure in Supabase dashboard (not CLI)

## Data & access control

- Database: Supabase (PostgreSQL 17, Auth, Storage, Realtime)
- RLS on tables; admin-only writes via `ADMIN_EMAILS` allowlist + `backend/shared/admin-validator`
- Service-role key is server-only, never in the browser
