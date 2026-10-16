---
description: Land the task end to end — scoped gates, commit, push, pull request, merge, cleanup
agent: build
---

Land the work in this tree, end to end and without asking.
[docs/agents/landing.md](../../docs/agents/landing.md) is the full procedure; this is the short form.

1. **Gate — only what the change can break.** `npm run typecheck`, then `npm run lint:fix`, then the
   affected tests (`npx vitest run <path>`, or `npx vitest run --changed`). Do **not** run the full
   `npm test` unless the change is repo-wide, and do **not** run `npm run build` unless nothing
   cheaper would catch a broken build (`next.config.js`, routing, `proxy.ts`, a dependency, a
   server/client boundary, a generated module). Never weaken or skip a gate; fix the cause.
2. **Commit.** Read `git status`, stage only this task's files, and write a Conventional Commits
   message (imperative subject under 72 characters, body explains why).
3. **Push.** `git push -u origin HEAD`, then confirm the commit exists in `git log --oneline -1`.
4. **Open the pull request.** `gh pr create --base main --fill`, then edit the body so it says what
   changed and why and links `Closes #<n>` when there is an issue.
5. **Merge once CI is green.** `gh pr checks <n> --watch`, then
   `gh pr merge <n> --squash --delete-branch`. If a check fails, stop, report it, and leave the pull
   request open — never merge over a red check.
6. **Clean up.** `git fetch --prune`, remove the worktree (`session_move` out of it first), delete
   the local branch, `git worktree prune`.

Report the pull request URL and the merged commit. If nothing changed, stop after step 1 and say so
rather than manufacturing a commit.
