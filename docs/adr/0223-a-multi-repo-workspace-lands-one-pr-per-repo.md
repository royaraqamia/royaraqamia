# 0223. A multi-repository workspace lands one pull request per repository

## Status

Accepted. Phase 3 of [ADR-0219](0219-the-assistant-delegates-code-to-a-sandboxed-runner.md);
it amends decision 2's "one repository, one branch and one pull request" scope.

## Context

ADR-0219 phase 1 gave a task one repository and one pull request. Members whose
change crosses an application and its API, or a site and its shared package,
had to split the work into tasks that could not see each other. Phase 3 asks for
multi-repository workspaces and cross-repo tasks, a second reviewer model before
a human sees a non-trivial diff, and wider autonomy once the eval suite shows
where diffs fail.

The eval harness that would produce those numbers is issue #1897; this change
does not invent data it cannot measure. It builds the gate and keeps the
reviewer off until a recorded run opens it.

## The decisions

1. **The workspace owns the repository set; the task narrows it.** A workspace
   gains a third kind, `group`: a member-named set of two to eight repositories
   with their default branches. A task inherits the whole set by default and
   may select a subset when it is created. The set is configuration, not a
   per-task choice, so the same application boundary is not re-selected by
   hand before every task.

2. **One installation covers the set.** Group creation refuses repositories
   that resolve to different GitHub App installations. The task therefore holds
   one short-lived installation token, not one per repository, and keeps
   ADR-0219 decision 2's "short-lived credential scoped to one member" without
   multiplying credentials. The token's scope is the explicit set; each
   repository still gets exactly one branch and one pull request.

3. **One run, sibling checkouts.** The Actions job is dispatched in the first
   selected repository. The runner clones every selected repository side by
   side under one workspace using the installation token, and keeps one model
   loop across them. A coordinated change (an API and its client) is one
   decision, not two models guessing at each other's half. Cloning uses an
   askpass helper, so no token enters a command line, a URL or a child process
   environment; the tool sandbox still refuses paths outside the workspace.

4. **A branch and a pull request per repository.** Every selected repository
   gets the same task branch name in its own repository, its own checkpoint
   commit, its own push and its own pull request. `coding_task_repos` records
   that row by row, and a task is completed only when every row has a pull
   request (or has failed). The first repository's values are mirrored on the
   task for the single-repository screens and older clients.

5. **The reviewer is a second model, switched on by evidence.** A committed
   record, `evals/coding/reviewer-gate.json`, carries the model, the price
   table, the thresholds and the eval evidence. `shared/contracts/coding-reviewer-gate.mjs`
   recomputes the gate from those numbers; `npm run check:coding-reviewer`
   fails a pull request that sets `status: "on"` without clearing them. The
   reviewer is off in this change because no eval run has been recorded yet.

6. **The reviewer advises; it never edits or merges.** It reads the diff when
   the change is non-trivial (at least two files or forty changed lines, both
   configurable in the gate file), and returns blocking and advisory findings.
   Blocking findings earn the writer exactly one repair pass before verification
   runs again, mirroring the judge's one rewrite (ADR-0213). Unresolved findings
   are attached to the step and to each pull request's body, where the human
   reviews them. The reviewer never turns a failing review into a failed task
   and never grants a capability.

7. **Cost and latency are measured before default.** Every reviewer step stores
   the model, the measured wall-clock latency and a USD estimate from the
   gate's list-price table. Tokens are measured by the provider usage the
   control plane already accumulates. The evidence record has to report a
   median added latency and a per-review cost inside the thresholds before the
   reviewer can become the default; a provider price the table does not name
   keeps the gate closed.

8. **The trust ladder does not widen in this change.** `plan` still requires an
   approval before writes, `edit` still requires a fresh approval before push,
   and `full` still has that escalation by its own mode. A wider autonomy is a
   later, measured change: the evidence record is the gate, and this change
   ships the gate, not the widening.

## Why not the alternatives

- **A task-level ad-hoc repository list** re-creates the same selection on every
  task and loses the reusable boundary that VS Code/Cursor multi-root
  workspaces, Devin's multi-repo sessions and CI monorepo manifests all share.
- **One dispatch per repository** duplicates the model's reasoning and cannot
  implement a change that spans two repositories; it is the failure mode this
  phase exists to remove.
- **A primary runner orchestrating sibling runs** adds distributed failure
  modes and a second coordination credential for no member-visible gain.
- **Switching the reviewer on now** would contradict ADR-0219 decision 6 ("a
  second reviewer model is deferred until eval data shows which diffs fail")
  and would add unmeasured latency and spend to every task.
- **Letting the reviewer edit or merge** puts a model in charge of the trust
  ladder that ADR-0180 decision 5 keeps outside the model.

## Consequences

- `coding_workspaces` gains `group_name`; `coding_workspace_repos` and
  `coding_task_repos` carry the set and its per-repository outcome;
  `coding_steps` gains `task_repo_id`, `model`, `latency_ms` and `cost_usd`.
- A partial handoff (one repository's push fails after another's pull request
  opened) fails the task with `runner_failed`; the completed repositories keep
  their pull requests, and the failed one is recorded on its row. There is no
  cross-repository rollback, and the ADR does not pretend otherwise.
- A group bootstraps the workflow in each of its repositories, so the member
  merges one pull request per repository before the first task in that
  repository can run.
- The local folder companion (ADR-0222) stays single-folder: a folder is one
  repository, and a task against it is unchanged.
- A native port is still not part of this phase: `/coding` remains a document
  surface, so `docs/mobile/parity.json` gains no row and the Android changelog
  gets no line.
