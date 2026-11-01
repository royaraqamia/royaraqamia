# Working in a worktree

One writer per working tree. The canonical checkout (`D:\Projects\royaraqamia` on this machine) is
shared: the human and any number of agent sessions can be in it at the same time, and concurrent
`git` there is not safe. Agents land work from their own worktree; the canonical checkout belongs to
whoever is sitting in it.

## What goes wrong in a shared tree

Measured on 2026-10-13, every one of these silent:

1. **A commit disappears.** Two `git commit`s racing for `index.lock` left the changes unstaged and
   created **no commit at all** — no reflog entry, and nothing that surfaced as an error. It was
   recoverable only because a patch had been dumped first.
2. **You publish someone else's work.** Pushing from the shared tree sends every commit in it,
   including another agent's unpushed commits (`0d2e0baa`, `ba77538a` were published this way).
3. **You inherit their work.** A new worktree starts at the canonical checkout's current HEAD, so
   anything unpushed sitting there comes with it. (Since ADR-0072 the cut is from local `main` on
   purpose; the step-1 reconcile is what keeps the owner's unpushed work out of it.)

## Create one

Run the sync first (`git fetch origin --prune`, then the reconcile in
[landing.md](landing.md), step 1): a fetched, reconciled local `main` is what makes the cut safe.
Then prefer the harness tool — it returns the directory and registers the worktree with OpenCode:

```
worktree_create({ name: "<task>" })
```

On this machine that lands under OpenCode's app-data share
(`C:\Users\Asus\.local\share\opencode\worktree\<id>\<name>`) at the canonical checkout's current
**local `main`, detached** — which is the point ([ADR-0072](../adr/0072-worktrees-are-cut-from-local-main.md)):
the checkout's HEAD is the one base both paths agree on. Put the work on a branch so the push has a
name:

```powershell
git worktree add -b <task-branch> <dir> main
```

Never start from `origin/main`: the checkout deliberately sits ahead of it while a pull request is
open, so a branch cut from the remote misses the landed record and the open stacks it is supposed to
grow on. The cut inherits the reconcile's state by design — the open `(#N)` copies come with the
worktree, and a local commit that is not a `(#N)` copy is unpushed owner work, which the sync's
stop-and-report rule keeps out of every worktree cut after it ([ADR-0072](../adr/0072-worktrees-are-cut-from-local-main.md)).

Those inherited copies are the checkout's record, and they do **not** travel into the pull request.
Before pushing (landing.md step 2a):

```powershell
npm run check:branch-base   # fails when the branch still carries a copy (the pre-push hook runs it)
npm run sync:base           # rebase onto origin/main, or onto the open pull request's branch
```

A dependency on unmerged work is based on that pull request's branch (`origin/<branch>`), never on
its local copy: sharing the base's commits is what keeps the later merge clean. Without this, the
copy and GitHub's squash of the same request are two different versions of one change, and every
file both sides touched conflicts when the lower request lands (#831, #832, #833).

## Make it runnable

A fresh worktree has no `node_modules` and no `.env` (both gitignored), so nothing runs until you add
them. Junctioning the canonical `node_modules` and copying `.env` is enough for the gate commands —
measured: `npx vitest run ...` passed (20 tests, 2.3s) and `git status` stayed clean.

```powershell
$wt = "<worktree dir>"
New-Item -ItemType Junction -Path "$wt\node_modules" -Target "D:\Projects\royaraqamia\node_modules"
Copy-Item "D:\Projects\royaraqamia\.env" "$wt\.env"
```

**Never run `npm install` / `npm ci` in a junctioned worktree.** An install replaces `node_modules`,
and a recursive delete of a junction on Windows can follow it into the canonical tree. When a task
needs a real install, give the worktree its own `node_modules` (`npm ci --prefer-offline`) and leave
the junction out.

## Land the work

Commit in the worktree, confirm the commit exists (`git log --oneline -1` — a lost commit looks like a
successful one), push the branch, and open a pull request. Finish with the local squash
([landing.md](landing.md), step 6), then stop: the GitHub merge is the repository owner's manual step
([ADR-0066](../adr/0066-agents-stop-at-the-open-pull-request.md) and its amendment).

Landing from a worktree updates the canonical checkout once more than it used to: after the pull
request opens, the branch's content is squash-merged into local `main`, so the checkout carries the
landed record instead of sitting behind `origin/main` until the owner merges. Two states are expected
while a pull request is open — `main` ahead with open squash copies, and, once the owner merges from
GitHub, `ahead, behind`, which the next task's step-1 reconcile resolves. The rule unchanged:
concurrent `git` in the canonical checkout is not safe, so the squash commits in the task's own
worktree and the checkout only receives a pointer move (landing.md step 6).

## Enforcement (machine-local)

The rule above is a convention, so this machine enforces it. An OpenCode plugin denies `git commit`
and `git push` for agent tool calls whose session sits in the canonical checkout, and leaves
worktrees alone. The human is unaffected: only agent tool calls pass through the hook.

- Decision logic: `scripts/agent-guard/decide.ts` (tracked, unit-tested in `npm test`).
- Wiring: `.opencode/plugins/shared-tree-guard/index.ts` - **machine-local**, because `.opencode/` is
  gitignored. `.gitignore` keeps it out of `git status` in every checkout.
- If it is ever missing, restore it: copy the file back and run `npm install` in `.opencode/`
  (the V2 plugin type package is `@opencode/plugin`; `.opencode/package.json` is machine-local too).

Verified end to end: in the canonical checkout `git commit --allow-empty --dry-run` comes back
`permission.rejected` with the message from `decide.ts`; the same command in a worktree runs.

When it denies you, the remedy is the rule itself: move the session into a worktree (`session_move`

- this is how the first commit of this contract was landed) or work in one from the start.

It is a guardrail, not a security boundary. It matches commands that begin with `git`, so a wrapper
(`cmd /c git commit ...`) slips past, and a session whose directory cannot be resolved is allowed
rather than blocked.

## Clean up

After the pull request is merged, and only when the owner asks. Removing the worktree or the branch
while the pull request is open takes away the thing it points at.

```powershell
git worktree list              # find them
git worktree remove <dir>      # remove one (refuses while dirty)
git worktree prune             # drop records for directories already gone
```

`worktree_remove` does the same, with force as an explicit opt-in — force only after checking that
nothing unlanded is in there.

Cleanup is the last step of landing the work, after the owner merges, not a separate chore: order and
the surrounding commit/push/pull-request steps are in [landing.md](landing.md).
