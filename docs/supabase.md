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

## Migrations convention

- Incremental timestamped files in `supabase/migrations/`, applied in filename order
- **Never edit an applied migration**
- Base schema lives on remote project (first migration `20260718105449` is an intentional stub) — add new changes as NEW files only
- Prefer additive, reversible migrations; include a rollback note in the PR body

## Drift check

`supabase/migrations/` and the linked project's `supabase_migrations.schema_migrations` are compared
in CI: `.github/workflows/migration-drift.yml` runs `scripts/check-migration-drift.mjs` on pull
requests and pushes that touch migrations, nightly, and on demand. A pull-request run is only a
check; every other run also reconciles one `opencode:alert` tracking issue — it opens when the check
fails (an out-of-band `apply_migration` has no pull request here to comment on) and closes it as soon
as the two sides agree again. Run it by hand with the two variables the agent workflows already use:

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npm run check:migrations
```

It fails in both directions, and says which one it found:

| Finding                                                | What it means                                                                                                       | What to do                                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A file the project has no version for                  | Production is behind the repo, so deployed code may expect schema that is not there                                 | `supabase db push`, then re-run the check                                                                                                                          |
| A recorded version with no file                        | Production is ahead: schema or a policy was applied out of band, unreviewed, with no migration file to roll it back | Add the file the project is missing, or, once you have decided production is wrong, revert the record with `supabase migration repair --status reverted <version>` |
| It cannot read the history (non-2xx, or an empty list) | Wrong `SUPABASE_PROJECT_REF`, an expired token, or a changed API shape                                              | Fix the credential. The check deliberately refuses to report "in sync" when it cannot look                                                                         |

A file the project must never have goes into `KNOWN_LOCAL_ONLY`, and an
intentional project-only version into `KNOWN_REMOTE_ONLY` — both at the top of the
script, next to the reason. Neither list holds anything: the first run (PR #217,
2026-10-14) compared 108 repo files against 108 recorded versions and found the
two sides identical, the base-schema stub included. The check compares version ids
only, so editing an applied migration stays invisible to it: this is a detector,
not a review. The alert path is drillable without touching production:
`gh workflow run 'Migration Drift' -f project-ref=<a ref that does not exist>` opens the tracking
issue, and a second dispatch with no input closes it.

## Forbidden without explicit human approval

- Destructive DDL (`DROP TABLE/COLUMN`, `TRUNCATE`)
- Disabling or weakening RLS
- Modifying `auth.users` data
- Storage bucket changes
- Data backfills over user tables

## Operations

- **Advisors:** Run `supabase_get_advisors` (security + performance) after schema changes
- **Deliberate advisor findings:** `unindexed_foreign_keys` names the `user_id` columns on `training_applications`, `consultation_bookings`, `project_requests` and `retainers`. They carry no index on purpose — nothing reads them yet (ADR-0005), and an index only pays for reads. `training_applications` dedupes on its own `user_id`, so if that ever becomes slow, index all four together rather than only the newest two. Likewise `rate_sync_runs.snapshot_id`
  carries no index: the table is written once per sync and read by status and recency, never by
  snapshot.
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
