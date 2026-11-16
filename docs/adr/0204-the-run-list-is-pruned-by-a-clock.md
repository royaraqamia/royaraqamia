# The run list is pruned by a clock

The repository setting "Check, workflow run, status, artifact and log retention" reads like it
deletes runs, and it does not. It expires **logs, artifacts and check data**; the run stays in the
Actions list forever, with its title, branch and conclusion.

The bill for that misconception was on 2026-11-16: 11,936 runs, back to 2026-07-06 — four months
past the 90-day ceiling the setting's own help text names — and every one still listed. Removing them
took 11,500 API calls and about two hours across several rate-limit windows. Nothing in the list had
a reader: `scripts/telegram/jobs.mjs` asks for the last 24 hours of runs, and
`.github/workflows/pr-land.yml` asks for the ones in flight.

## The decision

1. **A schedule deletes them, because nothing else will.** `.github/workflows/prune-runs.yml` runs
   daily at 02:20 UTC and calls `scripts/prune-workflow-runs.mjs`; `workflow_dispatch` with
   `keep_days`, `max_deletes` and `dry_run` is the hand-cranked version.

2. **Two days is the window, and it is a floor rather than a target.** The retention setting is at
   one day, so yesterday's logs are already gone; keeping the run two days keeps yesterday's
   failures visible with their jobs and steps, which is what someone reads the morning after.

3. **Oldest first, and a bounded number per run.** A run gets 1,000 requests an hour per repository
   and each delete is one of them, so `MAX_DELETES` defaults to 800 — above the ~440 runs a day this
   repository creates, and below the budget. A backlog converges over a few days; a job that tries
   to clear it in one pass fails halfway and leaves nothing but a rate-limit error.

4. **Only a `completed` run is a candidate.** A queued or in-progress run is never old enough to be
   safe, whatever its `created_at` says. A `404` means someone else removed it, which is a success
   with a different name, not a failure.

## Why not the alternatives

- **Set retention to one day and call it clean.** It cannot be clean: the setting has no relationship
  to the run record, which is the thing that accumulates. This was the assumption the 11,936 runs
  disproved.
- **One sweep of everything past the window.** That is 11,500 calls at 1,000 an hour: hours of wall
  clock inside one job, and a job whose only failure mode is the budget it cannot move.
- **`gh run delete` in a bash loop.** The same calls with no ordering, no budget awareness and no
  useful log line: the per-delete exit code has to be parsed to tell "gone" from "refused".
- **Keep the history for audit.** There is no audit reading it. Actions minutes are billed when a job
  runs, so the list costs nothing to keep and nothing to delete — it is only a page nobody should
  have to scroll.

## Consequences

- A failed run from three days ago is gone, and so are its logs and artifacts. Anything that has to
  outlive the window — a build artifact, a diagnostic — must be captured before it, not fetched after.
- Links to old runs in pull-request comments and Telegram messages stop resolving. The runs those
  workflows cite are always recent, so the practical loss is a broken link in a closed conversation.
- The pruning workflow is subject to its own window: its runs older than two days are deleted like
  any other, so its history is two days deep.
- The daily cap is a throughput statement, not a target. A day when 800 runs were deleted but 1,200
  aged out leaves a backlog that tomorrow's run continues from — reported in the job summary, never
  as a failure.
