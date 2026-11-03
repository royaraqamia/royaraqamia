# The implementer merges its own green pull request

ADR 0066 made every agent run stop at the open pull request, and the Issue Implementer has
reported "ready for a person to merge" since. That rule is right for a session and for `/oc`, where
a person is in the loop by definition. It is wrong for the unattended implementer now that the work
is a queue of 63 slices: every slice unblocks the next one, the next one is often another slice of
the same surface, and a manual merge per slice is the only step in the pipeline that cannot run at
night. The queue stops until a person wakes up.

This ADR grants the merge to the Issue Implementer alone, under three conditions that are all
mechanical:

- **Green, and only green.** `gh pr checks --watch` has already returned zero for that pull request.
  There is no timer, no "merge anyway", and no merge on a red run.
- **The commit it checked.** `gh pr merge --squash --match-head-commit <sha>` names the head commit
  the checks ran on, so a push that lands between the watch and the merge cannot be merged unseen.
- **Its own pull request.** Only a `opencode/*` branch opened during this run is a candidate; the
  branch list is already filtered by the numbers that existed before the run started.

The merge stays a squash, because that is the only merge `main` accepts; `--delete-branch` is still
never passed, so a later conflict resolution can still push to the branch that the pull request
points at. On a red run the implementer hands the issue to a person with `ready-for-human`, exactly
as before.

## Why not GitHub's auto-merge

`allow_auto_merge` is off and `main` has no branch protection. Turning auto-merge on would merge the
moment the pull request opens, because there is nothing to wait for; requiring checks through branch
protection would gate every human pull request on the same set and would make an invisible rule the
reason a person's pull request sits unmerged. The watch the workflow already performs is the gate,
and putting it in the workflow keeps the rule readable in the file that owns it.

## What this supersedes, and what it does not

- **Supersedes ADR 0066 for the Issue Implementer only.** A session and `/oc` still stop at the open
  pull request: they have a person attached, and the person is who merges.
- **Keeps ADR 0066's reasoning recorded.** The merge was manual for a real reason — nothing read the
  diff. What replaces that reading is the queue's own evidence: the checks, the ADR-0118 gate for a
  ported surface, and the issue's acceptance criteria, which the agent must satisfy before it writes
  `implemented`.
- **Does not change the local-squash rule.** `landing.md` step 6 still squash-merges the branch into
  the canonical checkout's local `main` as the checkout's record of what landed; the GitHub merge
  this ADR allows is what makes that copy redundant at the next reconcile, not something it replaces.

## The order, which this ADR also fixes

Merging is only half of "unattended". The picker takes six issues a day, one after another, and it
must not take one whose blocker is open. Two sources decide that, in this order:

1. **The native `blocked_by` edge.** A slice that waits for its siblings, a screen that waits for the
   security review, the last state of a surface that waits for the other three — all of them are
   edges, added in the pull request that files the slices.
2. **A `Blocked by: #n` line** in the body, read as the fallback for issues filed before the edges
   existed.

Within what is unblocked, `docs/mobile/parity-plan.json` is the order: the surface's phase, then the
issue number. The plan is already the work order for the port (ADR 0118's switch-on sequence), and
the number order inside a phase is the order the slices were written in.

## Considered options

- **Keep the merge manual and run more issues a day.** Rejected: six pull requests waiting for one
  person is not faster than one, and the queue still cannot move at night.
- **Let `/oc` merge too.** Rejected: `/oc` is a reply to a comment, so a person is already there; the
  merge is theirs.
- **Merge with `--admin`.** Rejected: there is no protection to bypass, and asking for the bypass is
  exactly the habit that makes a future protected branch silently weaker.
- **Auto-merge with a required-check rule.** Rejected above: with no protection it fires
  immediately, and turning protection on gates human pull requests on a rule nobody wrote for them.
