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
  - `authenticated_security_definer_function_executable` for `public.is_admin()`, the SpendTrack
    aggregates (`get_total_expenses`, `get_daily_totals`, `get_category_breakdown`) and
    `list_available_consultation_slots`— all intentional.`is_admin()`must be executable by`authenticated`for the certificate RLS policies (20260802120700, 20260917075359) and only
    ever returns the caller's own flag; the SpendTrack RPCs are client-callable by design and
    self-guard with`auth.uid() is distinct from p_user_id`; the consultation-slot function is
    the booking flow's client call and is revoked from `anon`/`public`.
  - `auth_leaked_password_protection` — the app already rejects breached passwords itself
    (`backend/clients/password-breach.ts`, HIBP k-anonymity, applied at signup and password
    set, gated by `passwordBreachCheckEnabled`). The Supabase Auth toggle is optional
    defense-in-depth and a dashboard setting, not a code change.
- **RLS testing:** Verify policies with `supabase list_tables verbose=true`
- **Edge functions:** `supabase functions deploy <name>` (`verify_jwt=true` by default)
- **Backups/Point-in-time:** Configure in Supabase dashboard (not CLI)

## Data & access control

- Database: Supabase (PostgreSQL 17, Auth, Storage, Realtime)
- RLS on tables; admin-only writes via `ADMIN_EMAILS` allowlist + `backend/shared/admin-validator`
- Service-role key is server-only, never in the browser
