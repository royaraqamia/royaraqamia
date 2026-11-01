---
description: Land the task end to end — sync, scoped gates, commit, push, pull request (the merge is manual)
agent: build
---

Land the work in this tree, end to end and without asking.
[docs/agents/landing.md](../../docs/agents/landing.md) is the full procedure; this is the short form.

1. **Start in sync.** `git fetch origin --prune`, reconcile local `main` per landing.md step 1, then
   cut the worktree from local `main` — never from `origin/main`
   ([ADR-0072](../../docs/adr/0072-worktrees-are-cut-from-local-main.md)).
2. **Gate — only what the change can break.** `npm run typecheck`, then `npm run lint:fix`, then the
   affected tests (`npx vitest run <path>`, or `npx vitest run --changed`), and
   `npm run check:branch-base` — a branch never carries a local `main` squash copy
   ([landing.md step 2a](../../docs/agents/landing.md)); `npm run sync:base` repairs one. Do **not**
   run the full `npm test` unless the change is repo-wide, and do **not** run `npm run build` unless
   nothing cheaper would catch a broken build (`next.config.js`, routing, `proxy.ts`, a dependency,
   a server/client boundary, a generated module). Never weaken or skip a gate; fix the cause.
3. **Commit.** Read `git status`, stage only this task's files, and write a Conventional Commits
   message (imperative subject under 72 characters, body explains why).
4. **Push.** `npm run check:branch-base`, then `git push -u origin HEAD`, then confirm the commit
   exists in `git log --oneline -1`.
5. **Open the pull request.** `gh pr create --base main --fill`, then edit the body so it says what
   changed and why and links `Closes #<n>` when there is an issue.
6. **Stop at the open pull request.** Report the pull request URL and stop. Do **not** merge — no
   `gh pr merge`, no auto-merge, no `--delete-branch`: the merge is the repository owner's manual
   step. Leave the worktree and branch in place, and leave local `main` alone; it is reconciled
   after the owner merges. A failing check is worth reporting, but the pull request stays open
   either way.

Report the pull request URL. If nothing changed, stop after step 2 and say so rather than
manufacturing a commit.
