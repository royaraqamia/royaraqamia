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
   anything unpushed sitting there comes with it.

## Create one

Prefer the harness tool — it returns the directory and registers the worktree with OpenCode:

```
worktree_create({ name: "<task>" })
```

On this machine that lands under OpenCode's app-data share
(`C:\Users\Asus\.local\share\opencode\worktree\<id>\<name>`) at the **canonical checkout's current
HEAD, detached**. When that tree holds unpushed commits you do not want to carry, start from
`origin/main` instead — and put the work on a branch so the push has a name:

```powershell
git worktree add -b <task-branch> <dir> origin/main
```

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
successful one), then push to `main` (the release train and Vercel deploy follow) or open a PR.

Landing from a worktree does **not** update the canonical checkout: it sits behind `origin/main` until
someone pulls there, and if it holds unpushed work of its own it is diverged rather than merely behind
(measured: `ahead 1, behind 1` right after a worktree push). Pull before starting work in it.

## Delegated agents

`opencode-delegate`'s `relay.mjs` defaults `--cd` to the caller's working directory, so a dispatch
without `--cd` runs the implementer **in the parent's tree**. Point every dispatch at a worktree:

```powershell
node "<skill-dir>/scripts/relay.mjs" --brief brief.txt --model <provider/model> --cd <worktree dir>
```

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

```powershell
git worktree list              # find them
git worktree remove <dir>      # remove one (refuses while dirty)
git worktree prune             # drop records for directories already gone
```

`worktree_remove` does the same, with force as an explicit opt-in — force only after checking that
nothing unlanded is in there.
