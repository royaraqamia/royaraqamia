# Landing the work

Every task runs the same loop, without being asked: start from the current remote, commit, push, and
open a pull request. The loop stops there — the merge is the repository owner's manual step, and no
agent merges. `/land` runs it in one go.

Work from your own worktree, never the canonical checkout — the guard refuses `git commit` and
`git push` there, and for good reason ([worktrees.md](worktrees.md)).

## 1. Start in sync

```powershell
git fetch origin --prune
git pull --ff-only                     # the canonical checkout, before the worktree exists
git worktree add -b <branch> <dir> origin/main
```

Cut the branch from `origin/main`, never from local `main` or from whatever the canonical checkout
happens to hold: a worktree inherits that HEAD, stale commits and all ([worktrees.md](worktrees.md)),
and a branch cut behind `origin/main` is a conflict waiting to be pushed. `--prune` drops the remote
branches deleted since the last fetch, which is half of what makes a landed branch stay gone.

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

## 6. Stop at the open pull request

The pull request is the handoff. Report its URL and stop.

Do **not** merge — not with `gh pr merge`, not with auto-merge, not with `--delete-branch` — and do not
wait on CI to decide anything. The checks run on the pull request where the owner can see them; their
result does not change what the agent does. The merge is the owner's manual step
([ADR 0066](adr/0066-agents-stop-at-the-open-pull-request.md)).

Leave the branch and the worktree exactly as they are. The pull request needs the branch, and the
worktree is where the owner (or a later session they ask) finishes the job. Do not prune, do not
`git branch -D`, and do not fast-forward the canonical checkout: local `main` is behind `origin/main`
until the owner merges, and that is expected.

A check that fails is still worth reporting — say which one — and the pull request stays open for the
owner either way.

## 7. After the owner merges (manual)

This half belongs to whoever merges. An agent runs it only when the owner asks it to clean up a
merged branch. The canonical checkout is still behind `origin/main`; this is what closes the gap.

Immediately after the merge. The worktree has to go from outside itself, so `session_move` the
session to the canonical checkout first — or run this in a later session there:

```powershell
git worktree remove <worktree dir>     # or the worktree_remove tool
git branch -D <branch>                 # the local branch, from the canonical checkout
git worktree prune
git fetch origin --prune
git pull --ff-only                     # local main now equals origin/main
git status -sb                         # no ahead/behind reported
```

The last three lines are what leave the canonical checkout level with `origin/main`, so the next task
starts from the current remote instead of from whatever the last one left behind.

A worktree refuses removal while it is dirty. Check `git status` in it first, and force it
(`git worktree remove --force` / `worktree_remove({ force: true })`) only after confirming nothing
unlanded is in there.

If the pull request was closed unmerged, the only cleanup left is the local branch — the canonical
checkout still wants the `--ff-only` pull.

If that pull refuses because local `main` has commits of its own, stop and say so: that is unpushed
work, and it is the one thing here that must not be resolved by the loop. Hand it to whoever owns
the checkout.

## When there is nothing to land

A task that changed no files ends at step 2. Say so rather than manufacturing a commit.
