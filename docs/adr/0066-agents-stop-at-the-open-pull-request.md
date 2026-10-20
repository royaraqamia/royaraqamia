# Agents stop at the open pull request

ADR 0048 gave the Issue Implementer the merge, and ADR 0049 extended it to `/oc`. Both reached
`main` without a person reading the diff; the tests and the preview were the only gate. The
repository owner now wants the merge to stay manual. This decides that every agent run — workflow or
session — ends at an open pull request, and that the merge is a step only a person takes.

The loop itself is unchanged up to the pull request. The OpenCode action commits, pushes and opens
the PR; the title is normalized, because a title `repo-checks` rejects is a red check; and `/land`
stops there for a session. What changes is the last step: the workflows still watch the checks
(`gh pr checks --watch`, capped at 40 minutes) so the thread or the issue records whether the pull
request is ready, but they no longer run a merge command, no longer enable auto-merge, and no longer
pass `--delete-branch`. The check watch only reads, so it uses the default `GITHUB_TOKEN`; there is no
merge identity to supply.

The Issue Implementer still hands the issue over: once the PR is open it comments the link and the
check result, removes `opencode:in-progress`, and swaps `ready-for-agent` for `ready-for-human`. The
issue stays open — `Closes #<n>` in the body closes it when the owner merges. A check that fails is
reported the same way and is not a reason to retry: the pull request stays open for the owner.

Sessions stop at the pull request too, and leave the worktree and branch in place, because the PR
needs the branch and the owner needs somewhere to finish the job. Local `main` stays behind
`origin/main` until the merge, and the cleanup in `landing.md` moves behind the owner's merge.

## Considered options

- **Keep the merge for the unattended implementer only.** Rejected: the owner asked for every merge
  to be manual, and a split rule would leave the one workflow that runs without a person watching as
  the only one that writes to `main`.
- **Remove the check watch as well.** Rejected: the watch is read-only and bounded, and it is what
  tells the issue thread and the `/oc` thread whether the pull request is ready to merge. Removing it
  would make the agent's report a guess.
- **Let GitHub auto-merge wait for the checks.** Rejected: with no branch protection there is nothing
  to wait on, so it merges immediately; requiring checks would be an invisible gate on every human
  pull request too. It is also still a merge the agent enabled, not a person.
- **Delete ADR 0048 and ADR 0049.** Rejected: they record why the merge was automated and what was
  weighed; this ADR supersedes them and keeps the history.
- **Clean up the worktree and branch immediately after opening the PR.** Rejected: the pull request
  points at the branch, and the worktree is where the owner or a later session fixes a failing check.

## Consequences

An agent run can no longer reach `main`, so `main` only moves when a person merges. The release train
(`release.yml`) still runs on that merge, because it is a person's push, and the agent workflows no
longer need `RELEASE_TOKEN`; `release.yml` and `shell-release.yml` keep using it for their own writes.

Cleanup is now the owner's: worktree, local branch and fast-forward of the canonical checkout happen
after the merge, not at the end of the agent run. A merge that a person makes by hand is also the
approval step, which is the point: the diff gets read.

The workflow tests guard the new boundary. They fail if a merge command, auto-merge or merge identity
returns to either workflow, and they still pin the step order (title normalization before the check
watch).
