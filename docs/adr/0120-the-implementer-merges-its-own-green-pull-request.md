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
points at.

A red run gets **one** repair attempt: the workflow hands the failing check names to a second agent
run on the same branch, waits for its push, watches again, and merges if that is green. One attempt,
not a loop — a second failure usually means the issue needs a decision rather than another patch, and
an unbounded retry is how a green check gets negotiated instead of earned. The repair is also told,
in the prompt, that no check may be made to pass by weakening it: no skipped test, no widened
tolerance, no removed gate. After the second red the issue goes to a person with `ready-for-human`,
exactly as before.

## The evidence the merge rests on

The merge is only as good as what the checks can see, so the job installs the toolchain the issues
actually need before the agent runs: Chromium for the Playwright specs, and JDK 21 with the Android
SDK and a warm Gradle cache so `npm run check:visual` runs here rather than only in CI. Without the
second the agent would be asked to switch a ported surface on (ADR-0118) while unable to run the
measurement that decides it. The agent runs the specs and the gate its own change reaches — never the
whole suite — and the pull request body has to say which of them it ran.

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

## Amendment (2026-11-04): the repair can run, and nothing leaves the queue

The first run of this workflow (2026-11-04) showed that the repair described above had
never executed. Three defects, and one rule that changes with them:

- **The repair had no git credential.** `Checkout` runs with `persist-credentials: false`
  because the opencode action needs a remote with no stored credential, and `GH_TOKEN`
  authenticates `gh` but not `git`. Every repair therefore died on its first command,
  `gh pr checkout`, with `Invalid username or token`, three rounds in a row, and the
  failing checks were never touched. The repair now runs `gh auth setup-git` in its own
  step, after the action has finished, so the action's token is still the only one it
  sees.
- **A conflicted pull request was reported green.** GitHub cannot build the merge ref a
  pull-request workflow runs against when the branch conflicts with `main`, so no workflow
  runs at all: the rollup holds only the skipped Supabase integration check, `gh pr checks`
  exits zero on it, and the merge is refused minutes later with "the merge commit cannot be
  cleanly created". `land-pull-request.sh` now asks `mergeable` first and names the
  conflict, requires at least one non-skipped check before it will call anything green,
  asks `mergeable` again immediately before merging, and reports the merge's own error
  instead of the symptom.
- **Each round was cut from the dispatch's `main`.** `max-parallel: 1` orders the rounds;
  it does not move the base. Round 4's branch descended from the commit the run was
  dispatched on, not from the `main` round 2 had merged into, and one merge that touches
  `docs/mobile/parity-plan.md` - every port does - is enough to conflict. A step now
  fetches `main` with the token inline and resets the tree to it before the agent runs, so
  no credential is left behind for the action.
- **Nothing is handed to a person any more.** The paragraph above says a second red round
  goes to a person with `ready-for-human`. It does not: this queue has one reader and that
  is the implementer, so a label naming a person is a label nothing picks up. An issue
  whose round did not land keeps `ready-for-agent`, its pull request stays open, and a
  later round takes the issue again. The claim label (`opencode:in-progress`) is the only
  one the workflow removes on failure.

The one repair attempt per round stands. What changed is that the attempt can now run, and
that a conflict counts as the failure it is rather than as a check that quietly never
happened.

## Amendment (2026-11-04, second): a pull request nobody lands is the workflow's problem

The rule above is a gate on the pull request, not a promise about it. A round that ends
red leaves the pull request open, and the picker skips an issue an open pull request names —
so the issue is parked, and the pull request waits for someone to notice. That is exactly
what happened to #996-#1000.

`pr-land.yml` closes it. It is not a second implementer: while an implementer run is in
flight, that run still owns landing its own pull request, and the sweep does nothing. Once
the run ends — cleanly or not — the next sweep (every 30 minutes) owns whatever it left
open, one landing run per pull request, so `concurrency` is per pull request and no two
writers touch one branch.

A landing run is one attempt: watch, merge when green; if red, repair once on the branch —
the conflict with `main` included, since a conflicted pull request gets no checks at all —
and watch again. Still red and the next sweep takes it again. After five attempts the
pull request is labelled `opencode:stuck` and left alone; removing the label puts it back
in the queue. That bound is deliberate: a check that cannot pass needs a decision, and an
unbounded agent is how a green check gets negotiated instead of earned.

One credential rule is load-bearing and was wrong in both workflows until this amendment:
**a push made with `GITHUB_TOKEN` starts no workflow**, so a repaired head is never
measured, and the rewatch can only report that nothing ran. Repairs therefore push with
`AGENT_PUSH_TOKEN` (a fine-grained PAT with `Contents: Read and write` and nothing else).
The token is a push credential only: the checkout, the watch, the comment, the label and
the merge all stay on `GITHUB_TOKEN`, so a leaked PAT cannot comment, label or merge
anything. When the secret is absent both workflows say so on the pull request instead of
pretending the repair worked.

## Considered options

- **Keep the merge manual and run more issues a day.** Rejected: six pull requests waiting for one
  person is not faster than one, and the queue still cannot move at night.
- **Let `/oc` merge too.** Rejected: `/oc` is a reply to a comment, so a person is already there; the
  merge is theirs.
- **Merge with `--admin`.** Rejected: there is no protection to bypass, and asking for the bypass is
  exactly the habit that makes a future protected branch silently weaker.
- **Auto-merge with a required-check rule.** Rejected above: with no protection it fires
  immediately, and turning protection on gates human pull requests on a rule nobody wrote for them.
