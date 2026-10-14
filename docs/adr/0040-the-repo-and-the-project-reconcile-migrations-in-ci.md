# The repo and the project reconcile migrations in CI

Two writers keep `supabase_migrations.schema_migrations`, the table that records what has been
applied to the linked project, and nothing compared the two lists:

- a pull request adds a file under `supabase/migrations/`, and `supabase db push` applies it by
  hand — a manual step in the deploy order (README, "Run database migrations");
- the autonomous issue pipeline writes the same SQL to the linked project through the Supabase
  MCP `apply_migration` tool, which runs before a human reads the pull request
  (`.github/workflows/issue-implementer.yml`, "Database change rules"), and its own instructions
  already admit the failure mode: _"Drift here is silent — compare the two lists by version."_

So drift is **a build failure**, not a review habit. `.github/workflows/migration-drift.yml` runs
`scripts/check-migration-drift.mjs`, which reads the version ids out of `supabase/migrations/*.sql`
and asks the project for its recorded list over the same Management API endpoint the Supabase CLI's
`migration list --linked` uses (`GET /v1/projects/{ref}/database/migrations`). It runs on pull
requests and pushes that touch migrations, nightly, and on demand; the nightly run opens (and later
closes) a single tracking issue, because an out-of-band `apply_migration` has no pull request here
to comment on.

Both directions fail, for different reasons. A file the project has no version for means the
deployed code may expect schema production does not have. A recorded version the repo has no file
for means schema or a policy that production has, that no review saw and no migration file can roll
back. The check refuses to pass when it cannot read the history at all, so a wrong project ref or a
changed API shape is a red build rather than a quiet "in sync".

## Considered options

- **Applying `supabase db push` automatically on merge.** Rejected: it would make the manual step a
  deploy gate, but it applies DDL to production with no review and no staging, which is the thing
  the agent pipeline is already doing too easily. The gate's job is to make divergence visible, not
  to widen who can write to production.
- **`supabase db diff --linked` in CI.** Rejected for now: it needs Docker and a shadow database per
  run, and it diffs schema _intent_ through migra or pg-delta, so its noise (publication changes,
  storage buckets, views with `security_invoker`) would have to be triaged on every run. Comparing
  version ids is what "did the two sides get the same list" actually asks.
- **Supabase branching for preview environments.** The right long-term answer for applying
  agent-authored DDL somewhere other than production, and the reason this ADR is a detector rather
  than a fix. Rejected for now because preview branches need config the repo does not have
  (`supabase/config.toml` is absent) and a plan that covers them; the detector does not depend on
  that decision and does not block it.
- **Trusting the pipeline's own mirror discipline** — write the file, apply it with
  `apply_migration`, read the assigned version back, rename the file to match (docs/supabase.md).
  Rejected: it is a convention an agent follows without verification, and the two failure modes it
  can still produce (a rename lost, a PR closed after the SQL was applied) are exactly the ones this
  catches.
- **Asking a human to run `supabase migration list` before every release.** Rejected: an instruction
  with no enforcement, which is what the deploy order already was.

## Consequences

The check needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`, which the agent workflows
already use; no database password, Docker, or linked working copy is involved, so the job costs
about five seconds.

It compares version ids only. A migration file edited after it was applied is invisible to it —
which keeps "never edit an applied migration" a review rule, and means the gate is not a substitute
for reading the SQL. Intentional one-sided versions belong in the two allowlists at the top of
`scripts/check-migration-drift.mjs`, next to the reason, instead of being silenced by weakening the
comparison. Neither list holds anything: the first run (this pull request, 2026-10-14) compared 108
repo files against 108 recorded versions and found them identical — the base-schema stub included,
which the project does record. The lists exist for the next intentional asymmetry, not for one this
repo already has.

The workflow is deliberately not a required check while it is new, the same way
`.github/workflows/e2e-sw-update.yml` is not: it depends on an external API and on secrets that fork
pull requests do not receive. Add it to branch protection once it has run green for a while.

This does not stop an agent from applying DDL to production before review — that is the staging
decision behind it, and the difference is that until that decision is made, the divergence now
shows up on a schedule instead of only when someone runs `db push` and is refused.
