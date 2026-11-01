# Landing the work

Every task runs the same loop, without being asked: start from the current remote, commit, push, and
open a pull request — then squash-merge the branch into the canonical checkout's local `main` and
stop (step 6). The GitHub merge is the repository owner's manual step: an agent never runs
`gh pr merge`, never enables auto-merge, and never passes `--delete-branch` (ADR-0066 and its
amendment). The local squash is the checkout's record of what was landed, not a merge to the remote;
the reconcile that reads it is the start of the next task.

Work from your own worktree, never the canonical checkout — the guard refuses `git commit` and
`git push` there, and for good reason ([worktrees.md](worktrees.md)).

## 1. Start in sync, reconcile `main`

```powershell
git fetch origin --prune
```

`main` in the canonical checkout carries the local squash copies earlier landings left (step 6) — one
`<subject> (#N)` per pull request, stacked on where `origin/main` was. Read them and reconcile before
cutting anything:

```powershell
git status -sb                                  # the canonical checkout has to be clean to reconcile
git log --oneline origin/main..main
gh pr list --state merged --json number --jq '.[].number'
```

- **`origin/main..main` is empty** — the normal start: `git pull --ff-only` fast-forwards.
- **Every `(#N)` above is a PR GitHub has merged** — stale copies; `origin/main` holds the same
  content under its own squashed hash. Drop them: `git reset --hard origin/main`.
- **Some `(#N)` is still open** — its copy is the only local record of the not-yet-merged pull
  request; leave `main` as it stands and the next squash chains onto it. The one exception: a
  _merged_ copy below an _open_ one. Then start from `origin/main` and re-apply the open ones,
  oldest first — one squad command apiece:

  ```powershell
  git merge --squash origin/<open-branch>; git commit -m "<subject> (#N)"
  ```

Then cut the branch — from local `main`, never from `origin/main`. A worktree inherits whatever HEAD
it is cut from ([worktrees.md](worktrees.md)), and `worktree_create` starts at the checkout's current
HEAD anyway, so the checkout's own `main` is the one base every path agrees on
([ADR-0072](../adr/0072-worktrees-are-cut-from-local-main.md)). What the branch inherits are the
open copies; it must not push them (step 2a). The reconcile above is what makes
that safe: every commit `origin/main..main` is a `(#N)` squash copy at cut time, and a local commit
that is not one is unpushed owner work — stop and report before cutting anything. A branch cut from
local `main` is stacked on the still-open copies, so while they are open its pull request's diff
reads wider than its own change; merges resolve it once the copies are not in the branch. `--prune` drops the remote branches deleted
since the last fetch, which is half of what makes a landed branch stay gone.

```powershell
git worktree add -b <branch> <dir> main
```

## 2. Gate — what the change can actually break

Run the checks the diff is capable of breaking, not the whole suite. Paying the full cost on every
task is what makes a task slow to finish, and a gate that slow is a gate that gets skipped. CI runs
the full suite on the pull request regardless, so this step is a fast local pre-flight.

```powershell
npm run typecheck            # always — `tsc --noEmit`, the cheapest broad signal
npm run lint:fix             # always
npm run format               # always — `format:check` is a CI step; ESLint does not format
npm run check:branch-base    # always — a branch never carries a local squash copy
npx vitest run <path>        # the test file(s) beside what you changed
npx vitest run --changed     # or everything the diff reaches, resolved from git
```

- **Tests:** the related files, or `--changed` when the blast radius is not obvious. **Never the full
  `npm test`.** The whole suite runs on the pull request already, so paying ~5 minutes locally proves
  nothing CI will not: "a shared type", "a base component" and "a repository contract interface" all
  read as repo-wide, and all of them are still CI's problem, not the local gate's.
- **Formatting:** `npm run lint:fix` fixes lint rules and leaves layout alone, so a file written by
  hand — or an attribute inserted with a script — passes every other local gate and fails the
  `Format Check` step on the pull request, after the branch is already pushed (#575). The fix is
  one command and costs seconds.
- **The cheap copy gates:** `check:arabic`, `check:digits`, `check:env-docs` and `check:surfaces`
  run in that same job and each takes seconds. Run the ones the diff can move — Arabic copy, a
  digit, an `example.env` key, a new surface — rather than meeting them in CI.
- **Build:** leave `npm run build` alone. Run it only when nothing cheaper would catch a broken
  build — `next.config.js`, routing, `proxy.ts`, a dependency, a server/client boundary, or a
  generated module — and then say in the pull request that you did.
- **Never** weaken, skip or delete a gate to land. Fix the cause, not the symptom.

## 2a. A branch never carries a local squash copy

Step 6 records a landing on local `main` as a new commit, `"<PR title> (#N)"`. That copy is a patch
applied to whatever `main` was at the time (and run through lint-staged), not the pull request's own
tree; GitHub's squash of the same pull request is the tree. Once the request lands, a branch stacked
on the copy is comparing two different versions of the same change, and the merge conflicts on every
file both sides touched. That is not hypothetical: #831, #832 and #833 all went conflicting within
minutes of their bases landing.

So the copies stay in the checkout as the record and never travel into a branch:

```powershell
npm run check:branch-base    # fails when the branch carries one (the pre-push hook runs it too)
npm run sync:base            # rebases onto origin/main, or onto the open PR's branch
git push --force-with-lease  # the rebase rewrote history; the lease is what makes that safe
```

A dependency on unmerged work is fine — it is based on that pull request's **branch**
(`origin/<branch>`), never on its local copy, so the two share commits instead of duplicating them.
The `--force-with-lease` above is the one force-push the workflow allows, and only on a branch whose
pull request has not been merged yet.

Step 6 tags each record with a git note (`refs/notes/landed-copies`) so the guard is exact: a copy
found by the note is refused whatever `main` looks like afterwards. Copies recorded before the note
existed are recognised by their subject — a `(#N)` the remote main already carries as a squash — which
is also what catches a branch whose checkout no longer holds the copy at all.

`/verify` is the deliberate full sweep (`typecheck`, `lint:fix`, full `npm test`) the owner may ask
for; it is what CI approximates, and an agent does not reach for it on its own.

## 3. Commit

Read `git status` before staging. Stage this task's files by name; a generated artifact left behind
by a build (`backend/config/generated/app-version.ts`, `public/sw-version.js`) or another agent's
leftover does not belong in the commit.

Conventional Commits, imperative subject under 72 characters, body explaining _why_:

```text
fix(store): keep the offline queue across a worker swap

`activate` deleted the caches the queue read from, so a swap lost every
pending write. The queue now lives in the Local Store, which the swap keeps.
```

## 4. Push

Name the branch `<type>/<issue>-<slug>` when it closes an issue (`fix/204-store-close-race`), and
`<type>/<slug>` otherwise (`docs/landing`).

```powershell
npm run check:branch-base   # the pre-push hook runs it too; step 2a is what it enforces
git push -u origin HEAD
```

Confirm the commit exists before you push — a commit lost to a race looks like a successful one
(`git log --oneline -1`; see [worktrees.md](worktrees.md)).

## 5. Open the pull request

```powershell
gh pr create --base main --fill
```

`--fill` takes the title and body from the commits; edit the body so it says what changed and why,
and link the issue it closes with `Closes #<n>` so the owner's merge closes it. Body conventions: the
`pr` skill.

## 6. The local squash — the last step

After `gh pr create`, the branch's content is squash-merged into the canonical checkout's `main`, and
the loop stops. The pull request itself is never touched afterward: no push to its branch, no edit,
no `gh pr merge`, no auto-merge, no `--delete-branch`, and waiting on CI remains nobody's duty — a
person merges on GitHub
([ADR 0066](adr/0066-agents-stop-at-the-open-pull-request.md) and its amendment).

```powershell
# in the task's worktree — the guard refuses agent commits in the canonical
# checkout, and this keeps one writer per tree while doing it that way
git branch temp/squash <local main's HEAD>
git checkout temp/squash
git merge --squash <task-branch>
git commit -m "<PR title> (#<n>)"      # body = the branch's reasoning: the why, not a changelog
git notes --ref=landed-copies add -m "PR #<n>" HEAD  # marks the copy as a copy (step 2a)
git checkout <task-branch>             # the worktree returns to the pull request's branch
git -C D:\Projects\royaraqamia reset --hard temp/squash
git -C D:\Projects\royaraqamia branch -d temp/squash
```

- **Form:** the subject is the pull request's own title with `(#<n>)`; the body is the reasoning the
  branch already carries. The shape matches the owner's squash-and-merge, so local `main` and what
  `origin/main` ends up holding read the same, and the `(#N)` suffix is what makes step 1's reconcile
  mechanical.
- **The `reset --hard` is bounded:** only after `git status -sb` shows the canonical checkout clean,
  and only because the result's content is the pull request's own diff — the tree does not change,
  the pointer does. A local commit on `main` that is _not_ a squash copy (`(#N)`-suffixed) is
  unpushed work of the owner's; a reset that would swallow it must stop and report instead.
- **One-commit branches still squash** — the form of the record is the point, not its size.
- **The worktree and the branch stay exactly as they are** — the pull request needs the branch, and
  the worktree is where the owner finishes a failing check.

A check that fails is still worth reporting — say which one — and the pull request stays open for the
owner either way.

## 7. After the owner merges (reconciled at the next start)

When the owner squash-merges from GitHub, `origin/main` gains its own hash for the same change; the
canonical checkout then reads `ahead, behind` — diverged, and that is expected. Nothing needs to run
at the merge itself: the divergence is exactly what the next task's step-1 reconcile resolves
(`reset --hard origin/main` once every local copy's `(#N)` reads merged). What must **not** happen is
resolving a local `main` with commits of its own any other way: a local commit that is not a squash
copy is unpushed work, and that is the one thing here that must stop and be reported rather than be
reset away. If the pull request was closed unmerged, the same rule protects the copy — its `(#N)` is
not in the merged list, so the reconcile keeps it.

Post-merge machine cleanup — worktree removal, branch deletion, `git worktree prune` — still happens
only when the owner asks. Removing the worktree or the branch while the pull request is open takes
away the thing it points at:

```powershell
git worktree list              # find them
git worktree remove <dir>      # remove one (refuses while dirty)
git worktree prune             # drop records for directories already gone
```

`worktree_remove` does the same, with force as an explicit opt-in — force only after checking that
nothing unlanded is in there.

### A merged branch is finished, and a push revives it

The merge deletes the branch on GitHub, so the remote ref is gone the moment the pull request merges.
A push to it afterwards **recreates** it, and GitHub then offers its "this branch had recent pushes —
Compare & pull request" banner: a branch that reads like work nobody landed, in an inbox that has
nothing left to land.

The way in is a conflict resolution still being written when the merge happens — the branch is
reopened by the push that was meant to make it mergeable. So the order is: resolve, push, then let the
merge land. After the merge the branch is read-only, and the worktree is only somewhere to look.

A revived branch proves itself empty before anything is done with it:

```powershell
git fetch origin --prune
git diff origin/main origin/<branch>     # prints nothing: the merge already has it
git push origin --delete <branch>        # the whole cleanup
```

If it prints a diff, that is work nobody merged: stop and report it rather than deleting the ref.

## When there is nothing to land

A task that changed no files ends at step 2 — no commit, no pull request, no squash. Say so rather
than manufacturing a commit.
