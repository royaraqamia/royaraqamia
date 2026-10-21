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

Then cut the branch — always from `origin/main`, never from local `main`: a merge-base above
`origin/main` inflates the pull request's diff with the still-open squash copies, and a worktree
inherits whatever HEAD it is cut from ([worktrees.md](worktrees.md)). `--prune` drops the remote
branches deleted since the last fetch, which is half of what makes a landed branch stay gone.

```powershell
git worktree add -b <branch> <dir> origin/main
```

## 2. Gate — what the change can actually break

Run the checks the diff is capable of breaking, not the whole suite. Paying the full cost on every
task is what makes a task slow to finish, and a gate that slow is a gate that gets skipped. CI runs
the full suite on the pull request regardless, so this step is a fast local pre-flight.

```powershell
npm run typecheck            # always — `tsc --noEmit`, the cheapest broad signal
npm run lint:fix             # always
npx vitest run <path>        # the test file(s) beside what you changed
npx vitest run --changed     # or everything the diff reaches, resolved from git
```

- **Tests:** the related files, or `--changed` when the blast radius is not obvious. Reach for the
  full `npm test` only when the change really is repo-wide — a shared type, a base component, a
  repository contract interface.
- **Build:** leave `npm run build` alone. Run it only when nothing cheaper would catch a broken
  build — `next.config.js`, routing, `proxy.ts`, a dependency, a server/client boundary, or a
  generated module — and then say in the pull request that you did.
- **Never** weaken, skip or delete a gate to land. Fix the cause, not the symptom.

`/verify` is the deliberate full sweep (`typecheck`, `lint:fix`, full `npm test`) for when you want
it, and it is what CI approximates.

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

## When there is nothing to land

A task that changed no files ends at step 2 — no commit, no pull request, no squash. Say so rather
than manufacturing a commit.
