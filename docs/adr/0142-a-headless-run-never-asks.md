# A headless run never asks

On 2026-11-08 the Issue Implementer's third round of the day ran for 93 minutes
and landed nothing. The agent was at step 142 of a well-specified parity issue,
had just edited `ChatThread.kt`, and asked to read a directory outside the
checkout: it resolved a path with `..`, which reaches
`/home/runner/work/royaraqamia`, the parent of the working directory. OpenCode
logged `permission: "external_directory", patterns:
["/home/runner/work/royaraqamia/*"]` and waited. Nobody was there. The step's
90-minute cap killed it 72 minutes later.

Two things were wrong, and only one of them was the path.

The first is that a run with no human in it could reach a state that only a
human can leave. `ask` is OpenCode's answer when no rule matches, and the
runner's config named only `/tmp/*`: every other external directory, and every
`.env` read, was an unanswered prompt waiting to happen. The second is that the
workflow then reported the wrong cause. With no result file and 93 minutes
elapsed, the outcome step concluded "the issue is too large for one round: slice
it rather than retry it" - a verdict that would have cut a fine specification in
half for a run that was blocked, not slow.

## Decision

1. **The runner's config is a committed file.** It was a JSON heredoc inside
   `.github/actions/opencode-runner/action.yml`, which no gate could read and no
   pull request could diff. It is `.github/opencode/runner.json` now; the action
   renders it with `node scripts/agents/runner-config.mjs --write`, which
   substitutes the one value a workflow input supplies (the Supabase project
   reference) and refuses to run outside a runner, because the target path on a
   developer machine is the owner's own config.
2. **`permission["*"]` is `allow`, and the denies follow it.** The rule set is
   evaluated last-match-wins, so a catch-all written first is overridden by every
   specific rule written after it. That is the only ordering in which a surface
   this file has never heard of - a new tool, or a default a later CLI adds -
   resolves to `allow` instead of becoming a prompt. Naming each surface
   individually cannot do that, because the file cannot name what does not exist
   yet.
3. **External directories are denied by default.** `external_directory` maps
   `*` to `deny` and allows exactly three things: `/tmp/*` (the result-file
   handoff), the runner's temp directory, and the CLI's own data directory
   (`$HOME/.local/share/opencode/*`), which is where a truncated tool result is
   read back from. The checkout's parent - the directory that cost the round -
   resolves to `deny`, which is an error the model reads in a second and routes
   around.
4. **The `.env` reads are decided, not defaulted.** The CLI's own defaults ask
   for `*.env` and `*.env.*` and allow `*.env.example`. The config denies the
   first two, so the only env file a run can read is the example - the same
   outcome as before, minus the wait.
5. **`doom_loop` stays denied, and questions stay denied.** A repeated identical
   call is what ends a loop; a question is what a run with no UI cannot answer.
   The GitHub handler already puts `question: deny` on the session, after the
   agent's own rules, so the config does not repeat it.
6. **A check computes the answer instead of reviewing it.**
   `npm run check:runner-permissions` replays OpenCode 1.x's evaluation
   (`findLast` over the flattened rule set, its wildcard, its `~`/`$HOME`
   expansion) against the CLI's shipped defaults and a table of the surfaces a
   run reaches. A probe that resolves to `ask` fails the job, and so does any
   rule written as `ask`. It runs in `Code Quality` beside the check that keeps
   the three agent doors honest (ADR-0136).
7. **The outcome names the block.** A step reads the CLI's own log and, when the
   last thing it did was an unanswered request, the outcome comment says which
   permission and pattern, and that the issue was never attempted. The
   elapsed-time verdict survives only for a round with no such request.
8. **A round that reported no spend leaves a row anyway.** The ledger recorded
   nothing for the 93 minutes above, because the CLI printed no usage payload,
   so the cap that exists to bound this work never saw it. The row is written
   with `source: 'unreported'` and no dollar figure rather than a guess.

## Consequences

- A permission request is now unreachable in a headless run: the specific
  denies decide the surfaces that used to ask, and the catch-all decides the
  rest. The cost is that a surface nobody named is allowed rather than blocked;
  the boundary that still holds is the runner's own, not the agent's.
- The CLI is installed from `releases/latest`, so the defaults the check
  mirrors are a snapshot of one release (v1.19.5 when this was written). A
  release that adds a new default `ask` is not a hang any more - the catch-all
  decides it - but the check will keep comparing against the old defaults until
  the table is updated. Pinning the CLI would make the table exact; the action
  is a third party's and installs `latest`, so that is a separate change.
- `opencode stats` has no `--json` in the version the runner installs, so
  `usage.mjs` has been reading nothing since that release. The unreported row
  makes the gap visible and countable; it does not measure the spend.
- A denied external read is a tool error in the transcript, not a failed run:
  the agent sees the path and the reason, and the round continues.

## Alternatives considered

- **Lower the implement step's cap.** Rejected: it shortens the wait without
  removing it, and a genuinely large issue would lose the budget it needs.
- **Tell the agent not to read outside the checkout.** Rejected: the prompt
  already tells it to stop at an hour, and it did not, because the block was not
  a decision it could see. A rule is enforced; a sentence is hoped for.
- **Allow every external directory.** Rejected: the parent of the checkout holds
  the runner's own scratch and other checkouts, and a deny there is what makes
  the leak a deny rather than a silent read.
- **Write the config for the version installed today and name every surface.**
  Rejected: the file cannot name a permission the next release invents, and the
  failure mode of missing one is exactly this ADR.
