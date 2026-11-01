# Worktrees are cut from local main

The worktree recipe told every agent to cut from `origin/main`, never from the checkout's local
`main` (`docs/agents/landing.md`, step 1, and `docs/agents/worktrees.md`): a merge-base above the
remote would pull the open `(#N)` squash copies into the pull request's diff. The rule and the
tooling disagreed. `worktree_create` — the path the docs say to prefer — starts at the canonical
checkout's current HEAD and cannot be pointed at a ref, so the tool most agents used always cut from
local `main` while the command fallback told them to cut from `origin/main`; and a branch built on
the remote's tip is a branch whose base the checkout itself does not hold. Two agents could start
the same task's branch from different commits depending only on which path they read first.

This decides the checkout's local `main` is the base, for every path:

```powershell
git worktree add -b <branch> <dir> main
```

`worktree_create` does exactly that by construction, so the two recipes stop diverging. What makes
the cut safe is unchanged — it is what the sync ([landing.md](../agents/landing.md), step 1) already
does: fetch, reconcile the local records, and refuse to proceed past a local commit that is not a
`(#N)`-suffixed squash copy, because that is unpushed work of the owner's and no worktree may
inherit it. Synced that way, everything a worktree can inherit from `main` is the open pull
requests' own records. Those records are local: a branch must drop them before it is pushed, which
is what `npm run check:branch-base` refuses and `npm run sync:base` repairs — see the amendment at
the end of this file.

## What changes on the pull request

A branch cut from local `main` is stacked on those open copies, so while the stack is still open the
pull request's diff reads wider than its own change — that was the hazard the old rule named, and
this decision accepts it instead of dodging it. It resolves the way stacks do: GitHub recomputes the
diff as `origin/main` moves, content the base has already taken drops out, and a squash-and-merge of
the stack leaves the pull request reading exactly its own change. The checkout's landed record stops
being a base problem — the branch and the record grow from the same commits.

## Considered options

- **Keep `origin/main` as the base and treat `worktree_create` as the exception.** Rejected: the
  exception was the rule in practice — `worktree_create` always cuts HEAD — so the docs would keep
  describing two different bases, and a branch whose base the checkout does not hold still lands
  wrong on the reconcile.
- **Cut from local `main` only when it is even with `origin/main`.** Rejected: the checkout is
  deliberately ahead whenever a pull request is open, so the rule would never apply mid-stack
  without first destroying the local records, which the reconcile exists to keep.
- **Teach `worktree_create` to accept a ref.** Rejected: it is the harness's tool, not this
  repository's, and the decision removes the need — local `main`, fetched and reconciled, is the
  base both recipes already share.

## Consequences

`landing.md`, `worktrees.md`, the `/land` command (`.opencode/command/land.md`, tracked like the
docs) and the guard's deny message (`scripts/agent-guard/decide.ts`, pinned by its unit test) now
name local `main`. The guard's decision logic is untouched — `worktree add` was never a writer — and everything
`landing.md`, `worktrees.md`, the `/land` command (machine-local, mirrors the tracked docs) and the
guard's deny message (`scripts/agent-guard/decide.ts`, pinned by its unit test) now name local
`main`. The guard's decision logic is untouched — `worktree add` was never a writer — and everything
the new base inherits is bounded by the reconcile the same task already runs.

## Amendment (2026-11-01): the copies are a record, not a base

The section above rests on one claim: "content the base has already taken drops out". That is only
true when the local copy and GitHub's squash are byte-identical, and they are not. Step 6 records a
landing as `git merge --squash`, which applies the branch's _patch_ to whatever `main` was at that
moment and runs it through lint-staged; the squash GitHub writes is the pull request's _tree_. The
two differ wherever the bases differed, and a later pull request stacked on the copy conflicts on
every file both sides touched — #831, #832 and #833 all opened conflicting this way within minutes
of their bases landing.

The base decision stands: worktrees are still cut from local `main`, because that is the one base
every path agrees on. What changes is that the copies do not travel: before a branch is pushed it is
rebased onto a base that has no copies,

- `origin/main` when the copied pull request has landed, or
- `origin/<branch>` of the pull request it depends on, when that request is still open — sharing the
  base's commits is what makes the later merge clean.

`npm run check:branch-base` refuses a branch that still carries one (it is what the pre-push hook
runs and what landing's gate step names); `npm run sync:base` performs the rebase and says what to
push. This narrows, rather than reverses, the decision above: the cut path is unchanged, and local
`main` keeps its records.
