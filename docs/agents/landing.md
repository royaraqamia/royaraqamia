# Landing the work

Every task ends the same way, without being asked: the change is committed, pushed, opened as a pull
request, merged once CI is green, and then the branch and the worktree it came from are deleted.
`/land` runs the sequence in one go.

Work from your own worktree, never the canonical checkout — the guard refuses `git commit` and
`git push` there, and for good reason ([worktrees.md](worktrees.md)).

## 1. Gate — what the change can actually break

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

## 2. Commit

Read `git status` before staging. Stage this task's files by name; a generated artifact left behind
by a build (`backend/config/generated/app-version.ts`, `public/sw-version.js`) or another agent's
leftover does not belong in the commit.

Conventional Commits, imperative subject under 72 characters, body explaining _why_:

```text
fix(store): keep the offline queue across a worker swap

`activate` deleted the caches the queue read from, so a swap lost every
pending write. The queue now lives in the Local Store, which the swap keeps.
```

## 3. Push

Name the branch `<type>/<issue>-<slug>` when it closes an issue (`fix/204-store-close-race`), and
`<type>/<slug>` otherwise (`docs/landing`).

```powershell
git push -u origin HEAD
```

Confirm the commit exists before you push — a commit lost to a race looks like a successful one
(`git log --oneline -1`; see [worktrees.md](worktrees.md)).

## 4. Open the pull request

```powershell
gh pr create --base main --fill
```

`--fill` takes the title and body from the commits; edit the body so it says what changed and why,
and link the issue it closes with `Closes #<n>` so the merge closes it. Body conventions: the `pr`
skill.

## 5. Merge, once CI is green

```powershell
gh pr checks <n> --watch     # idle wait; exits non-zero the moment a check fails
gh pr merge <n> --squash --delete-branch
```

`gh pr checks --watch` polls until every check settles, so the wait is GitHub's work, not local test
time. If a check fails, stop: report the failing check, leave the pull request open, fix the cause,
and start again from step 1. Never merge over a red check.

`--delete-branch` drops the remote branch, and `main` is also configured to delete it on merge.

## 6. Clean up

Immediately after the merge. The worktree has to go from outside itself, so `session_move` the
session to the canonical checkout first — or run this in a later session there:

```powershell
git fetch --prune
git worktree remove <worktree dir>     # or the worktree_remove tool
git branch -D <branch>                 # the local branch, from the canonical checkout
git worktree prune
```

A worktree refuses removal while it is dirty. Check `git status` in it first, and force it
(`git worktree remove --force` / `worktree_remove({ force: true })`) only after confirming nothing
unlanded is in there.

If the pull request was closed unmerged, the only cleanup left is the local branch.

## When there is nothing to land

A task that changed no files ends at step 1. Say so rather than manufacturing a commit.
