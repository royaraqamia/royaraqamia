# The issue implementer merges its own pull request

The implementer stopped at an open pull request. Somebody had to read it and merge it, which made the
one-a-day contract a one-a-day-plus-one-person contract: the branch, its preview and its issue all sat
waiting, and a day nobody looked was a day the pipeline did not finish. This decides that the
implementer lands what it opens — the loop `docs/agents/landing.md` describes for a person and
`/land` runs for a session — and that a merge is the last step of the run rather than a proposal to a
person.

The loop itself is unchanged. The OpenCode action commits, pushes and opens the pull request; the
title is normalized first, because a title `repo-checks` rejects is a red check and the merge refuses
a red check; then a new step waits for the pull request's checks (`gh pr checks --watch`, capped at
40 minutes) and merges with `--squash --delete-branch`, which closes the issue through the
`Closes #<n>` line already in the body. A check that fails, or a wait that never settles, is not
merged: it is reported on the issue and handed to a person, which is the path a failed implementation
already took.

The agent still runs no `git` command, and it never holds the merge. The wait belongs to the workflow,
where it is deterministic, bounded and visible in the run log.

## Considered options

- **The default `GITHUB_TOKEN` as the merge identity.** Rejected: a merge made with `GITHUB_TOKEN`
  starts no workflows. `release.yml` is triggered by `workflow_run` on `Code Quality` completing for
  a push to `main`, so a token-merged commit would land with no version bump and no tag — `main`
  would drift ahead of the last release, and the drift would surface for whoever merged the next pull
  request by hand. `secrets.RELEASE_TOKEN` is an identity a merge cannot be distinguished from a
  person's by, and it is a token `release.yml` already trusts.
- **Merging with `GITHUB_TOKEN` and dispatching `release.yml` explicitly.** Rejected: it replicates
  the ordering the trigger already encodes — release waits for `Code Quality` on the same commit —
  and the dispatch would have to reproduce that wait itself, adding a second place where "is this
  commit tested" is answered.
- **Enabling GitHub auto-merge and letting the pull request merge when its checks pass.** Rejected:
  with no branch protection there is nothing for auto-merge to wait on, so it merges immediately;
  making it wait means required-check configuration, which becomes an invisible gate on every human
  pull request too.
- **Only merging when no person has touched the pull request.** Not rejected so much as not built:
  `ready-for-agent` is already a person's approval of the work, and a pull request somebody has
  commented on is a candidate for a later refinement rather than a reason to hold this one.
- **Leaving the gates alone.** The prompt used to demand `npm test` and `npm run build` on every
  issue, which is minutes of the runner's time for a check CI now repeats on the pull request. The
  prompt asks for the gates the diff can break instead, and for the build only when nothing cheaper
  would catch it.

## Consequences

An unattended run can now reach production without a person reading its diff. That is a real change
in the trust surface and the reason this decision is written down. What remains is the boundary that
was there before: the issue had to carry `ready-for-agent`, only maintainers and the planner apply
it, the change passes the same checks every pull request passes, and `repo-checks`, `code-quality`
and the Vercel preview all run before the merge. What is removed is the read of the diff, not the
tests.

Two things have to stay true. The merge step needs `RELEASE_TOKEN` present: with no secret, `GH_TOKEN`
arrives empty, `gh` fails, and the outcome step — which now runs `always()` — records that and hands
the issue to a person. That failure is the safe one. And `delete_branch_on_merge` is enabled on the
repository, so a merged branch does not linger; the step also passes `--delete-branch`, which covers
a repository where the setting is turned back off.

The job's timeout grows from 100 to 150 minutes, because the run now waits on checks the implement
step used to end before. The wait is capped at 40 minutes: a check that never settles hands the issue
to a person rather than holding the runner for the full job.
