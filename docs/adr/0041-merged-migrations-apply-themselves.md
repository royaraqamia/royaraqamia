# A merged migration applies itself, and a destructive one does not

`supabase/migrations/` and the linked project had two ways to part company and nothing to bring them
back: a merged migration file waited for somebody to run `supabase db push`, and the agent pipeline
applied its own SQL to the project through the Supabase MCP `apply_migration` tool before the pull
request was read. ADR-0040 made the disagreement visible. This decides what happens next: on `main`,
the pending migrations are applied by CI, so a merge is the only step a person takes.

The job is ordered **plan → vet → apply → verify**, and each step exists because skipping it would be
worse than the manual step it removes:

- **Plan.** `supabase db push --linked --dry-run` prints what a merge would apply, using only
  `SUPABASE_ACCESS_TOKEN`. It is a diagnostic as much as a notice, and it reports rather than gates,
  so a change in the CLI cannot turn into a red build by itself.
- **Vet.** `scripts/check-migration-safety.mjs` reads the pending files and refuses the whole run if
  one of them drops a table or a column, truncates, turns row level security off, writes to
  `auth.users` or Storage, drops an object the same file does not recreate, or deletes rows without a
  `WHERE`. That list is "Forbidden without explicit human approval" from docs/supabase.md, mechanised
  — the policy was already written, it just had nobody to enforce it.
- **Apply.** `supabase db push --linked --yes`, on `SUPABASE_ACCESS_TOKEN`: linking a project is
  enough for the CLI to mint its own login role, which the plan step exercises on every push with the
  same credentials. `SUPABASE_DB_PASSWORD` is passed through when the repository has one — the CLI's
  documented CI path — and if the apply cannot connect or write, the verify step reports the
  migration as still pending and the alert links to the run.
- **Verify.** The drift check runs strictly afterwards, so nothing here claims success on the
  strength of a command that exited zero: the project's recorded versions are read back and compared
  with the files.

The plan is the same plan the repo already documented for humans — `supabase db push` after the
migration is merged — moved into CI so that it stops depending on someone remembering. The order is
"merge, then apply" rather than "apply, then merge" because review is the only gate this repo has on
schema, and a migration that has not been reviewed has no business reaching production, however
convenient the head start.

## Considered options

- **Keep applying before review (the MCP `apply_migration` path), and make the applier a fallback for
  human-authored migrations only.** Rejected as the answer to this decision, though it is what the
  agent pipeline still does today: it leaves the one path that actually writes schema to production
  un-reviewed, which is the hazard ADR-0040 was written about. (Moving the pipeline off
  `apply_migration` is the next decision, not this one; until then the applier is a no-op whenever the
  agent already applied its own migration.)
- **Applying through the Management API's `POST /database/migrations`** (what the MCP tool calls),
  which also needs no database password. Rejected: that endpoint assigns the version itself,
  so the recorded version would stop matching the file name and the drift check would then report the
  repo and the project as out of sync after every apply — or the comparison would have to match on
  names, which is a weaker identity than a version. `db push` records the file's own version, which is
  the property ADR-0040's check was built on.
- **Applying through `POST /database/query` inside one transaction, writing the history row by hand.**
  Rejected: it re-implements the bookkeeping the CLI already does, breaks on the non-transactional
  statements Postgres allows in a migration (`CREATE INDEX CONCURRENTLY`), and would make the recorded
  history a product of our own script rather than of the tool this repo tells people to use.
- **Applying everything, including the destructive statements.** Rejected: the repo already forbids
  those without a person, and "a machine merged it" is not approval. Refusing is cheap — the
  migration is a file in a pull request, and applying it by hand is exactly what happens today.
- **Vetting with a keyword search.** Rejected: on this repo's own migrations a plain search for
  `drop table` hits rollback comments, and `truncate` hits a `revoke insert, update, delete,
truncate, ...` privilege list. The vet reads statements, after stripping comments, and treats a
  dropped object as routine when the same file recreates it — which is the `drop policy if exists x;
create policy x ...` idiom the repo uses everywhere.
- **A pre-merge dry run of the SQL**, so a broken migration is caught while the pull request is open.
  Not rejected so much as not yet built: it is the next thing worth adding, and it is what the MCP
  path's apply was quietly providing.

## Consequences

The applier is the only thing in the repo that writes DDL to production on its own, and it does that
only for files that were merged, and only for statements the vet allows. Everything else — the
destructive statements, and the migrations the agent pipeline still applies itself — keeps a human in
the loop.

It needs no new secret: `SUPABASE_ACCESS_TOKEN` is enough, because linking a project lets the CLI mint
its own login role, and the plan step connects with exactly those credentials on every push. Setting
`SUPABASE_DB_PASSWORD` is still honoured, and is the path the CLI's own CI documentation recommends —
worth doing if the login role ever turns out to be narrower than the CLI needs, because the apply then
does not depend on it. The token's blast radius is what it always was: it can already apply migrations
through the Management API.

Because the apply happens on the push to main, it races the Vercel deploy of the same commit: the
migration runs in seconds while the build takes minutes, so the schema is normally in place before the
new code serves traffic. That is an ordering assumption, not a guarantee; a migration whose SQL is
slow (a large backfill) should be reviewed as one that competes with the deploy.

A refused migration keeps the drift alert open, and the alert says what to do. Nothing in the applier
is allowed to close it except a verify step that read the project back.
