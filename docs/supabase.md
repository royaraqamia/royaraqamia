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
- **RLS testing:** Verify policies with `supabase list_tables verbose=true`
- **Edge functions:** `supabase functions deploy <name>` (`verify_jwt=true` by default)
- **Backups/Point-in-time:** Configure in Supabase dashboard (not CLI)

## Data & access control

- Database: Supabase (PostgreSQL 17, Auth, Storage, Realtime)
- RLS on tables; admin-only writes via `ADMIN_EMAILS` allowlist + `backend/shared/admin-validator`
- Service-role key is server-only, never in the browser
