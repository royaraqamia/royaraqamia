# The issue backlog is planned and implemented by two autonomous workflows

Two scheduled OpenCode workflows close the loop from codebase analysis to pull request with no
human in the middle. The **Issue Planner** (`.github/workflows/issue-planner.yml`) runs daily,
scans the code for at most five high-confidence findings, de-duplicates them against every open
issue and pull request, and publishes each as a fully-specified issue labelled `ready-for-agent`

- `opencode:planned`. The **Issue Implementer** (`.github/workflows/issue-implementer.yml`) runs
  three hours later, claims the oldest `ready-for-agent` issue that is unassigned and not
  referenced by an open pull request, implements it, and opens a pull request whose body carries
  `Closes #<n>`. Both phases hand structured data to GitHub through files in `/tmp`
  (`issues.json`, `result.json`); the OpenCode action itself never creates issues.

## Considered options

- **A human gates every issue before implementation** (planner labels `needs-triage`, a person
  promotes to `ready-for-agent`). Rejected: the maintainer asked for the most autonomous path.
  The veto survives — removing `ready-for-agent` from an issue stops it — but it is opt-out, not
  opt-in.
- **Trigger the implementer from the `issues: [labeled]` event.** Rejected: GitHub does not run
  workflows in response to events caused by the default `GITHUB_TOKEN`, so an implementer woken
  by the planner's own label write would never fire. A scheduled poll is the only reliable
  trigger.
- **Let the planner's OpenCode action open the issues directly.** Rejected: the action carries
  the branch/commit/push contract, not an issue-creation one. A trailing `actions/github-script`
  step reads the planner's `/tmp/issues.json` and is the only thing that touches the issue
  tracker.
- **One combined plan-and-implement job.** Rejected: the two concerns run on different cadences
  and need different permissions; splitting them keeps the planner read-only over the tree.

## Consequences

An issue reaches a pull request unattended within a day of being filed as `ready-for-agent`, so
the existing backlog drains and new findings arrive already implemented. Failure is explicit: a
run that cannot implement an issue comments the reason and swaps `ready-for-agent` for
`ready-for-human`, which both pages a human and removes the issue from the eligible set (no retry
storm). The `opencode:planned`, `opencode:in-progress` and `opencode` labels are created
idempotently by the workflows. Because the default `GITHUB_TOKEN` cannot trigger workflow events,
the daily schedule is load-bearing, not a convenience. The implementer treats issue text as its spec, so the
`ready-for-agent` label is the trust boundary: only the planner and maintainers apply it, and a
stranger cannot hand the implementer instructions by opening an issue.
