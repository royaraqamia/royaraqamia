# The phase-1 coding runner

The coding agent is two planes (ADR-0219). The Next.js service is the control
plane: it authenticates the member, stores the GitHub App installation, creates
tasks, holds the model key and decides when a step may proceed. The execution
plane is a GitHub-hosted Actions job in the member's own repository. It checks
out the repo, calls the model through the control plane, edits files, commits
checkpoints, pushes one task branch and opens a pull request.

No member code runs in the chat service. No model key, Supabase key or other
member's data enters the Actions job.

## Pieces

- `backend/clients/github-app.ts` - the GitHub App/OAuth client. OAuth users
  connect with `authorizeUrl` and `exchangeUserCode`; `listInstallations` finds
  the installations the member can use. `createAppJwt` signs a 9-minute RS256
  JWT, `getInstallationToken` exchanges it for a short-lived installation token,
  and `dispatchWorkflow`, `getWorkflowRun`, `listRepos` and `createPullRequest`
  use that token. Every call has a 20-second timeout and sends a User-Agent.
- `backend/services/coding/sandbox-runner.ts` - the `SandboxRunner` port. Only
  `start` exists in phase 1; status, logs and cancel arrive through the HTTP
  callback rather than a provider API.
- `backend/services/coding/github-actions-runner.ts` - dispatches
  `noor-coding.yml` on the member's repository at the task's base branch. The
  task id is the correlation handle because GitHub's dispatch endpoint does not
  return a run id.
- `assets/coding/noor-coding.yml` - the template a bootstrap PR installs at
  `.github/workflows/noor-coding.yml` in the member's repository. The same file is
  served at `public/coding/noor-coding.yml` so the bootstrap reads it from this
  origin instead of from a bundle path. It checks out
  the dispatch ref with Node 22, downloads the runner script from the control
  plane origin and runs it with a per-task timeout and a task-keyed concurrency
  group. Its permissions are `contents: write`, `pull-requests: write` and
  `actions: read`; it sees only GitHub's own job token.
- `public/coding/runner-v1.mjs` - a dependency-free Node 22 script. It holds the
  conversation, calls local tools, polls decisions and posts progress.

## Control-plane contract

The runner reads `NOOR_TASK_JSON`, `NOOR_CALLBACK_TOKEN`, `GITHUB_TOKEN`,
`GITHUB_REPOSITORY` and `NOOR_API_URL`. It sends three authenticated calls with
the short-lived callback token:

- `POST /api/coding/runner/update` with a `CodingRunnerUpdate` frame
  (`kind`, `status`, `summary`, `diff`, `failureCode`, `inputTokens`,
  `outputTokens`).
- `GET /api/coding/runner/task` returning `{ spec, status, decision }`. The loop
  stops when `status` is no longer `running` or `queued`, or when `decision` is
  `reject`.
- `POST /api/coding/runner/llm` with `{ messages, tools }`, returning
  `{ message, usage }`. The model key is applied on the server, never in the
  runner.

`task_json` and `runner_url` are additional dispatch inputs: the workflow needs
the task spec and a public URL for the script. Neither carries a credential.

## Modes and boundaries

`plan` starts with read-only tools. The runner posts a `plan` step with status
`running`, a short plan and a proposed unified diff, then polls `/task` until the
member approves or rejects. Only after approval do write tools appear.

`edit` allows local edits and repository commands but stops before the push: it
posts a `push` step with status `running` and polls for a fresh approval. `full`
has that escalation granted by its mode. Every mode refuses to push to the base
branch, `main`, `master` or `develop`. The model cannot call `git push` through
`run_command`; the push is one deliberate act in the handoff.

`run_command` accepts only `npm`, `npx`, `node`, `git`, `pnpm` and `yarn`, with
arguments as an array, a 5-minute cap and the callback and GitHub tokens removed
from the child environment. File tools reject paths that escape the workspace.

At the end the runner runs the repository's own `typecheck`, `lint` and `test`
scripts when they exist, attaches their output to a `test` step, commits a
checkpoint, pushes `HEAD:<task branch>` to origin and opens a pull request. A
failed gate stops the task with `checks_failed` before the push. Token and time
caps come from the task spec and produce `budget_exhausted`.

## What the owner configures

Set these in the control plane's environment:

- `GITHUB_APP_ID` - numeric App id, used as the JWT `iss`.
- `GITHUB_APP_PRIVATE_KEY` - the App's PEM. A secret manager may store newlines
  as the two characters `\` and `n`; the client folds those into real newlines.
- `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET` - OAuth credentials for
  the member connect flow.

The App needs `read:user` for the OAuth exchange, installation access to
contents and pull requests, and permission to dispatch `noor-coding.yml`. It is
installed per member; the installation token is encrypted at rest and scoped to
one task. The template is delivered through a bootstrap pull request into the
member's repository, so the member can review the workflow before it runs. The
`actions/checkout@v4` and `actions/setup-node@v4` references are the template
ids named in phase 1; pin them to commit SHAs in the bootstrap PR if the
member's policy requires immutable actions.

The runner script is served from the same public origin as the callback routes.
Keep it versioned: an executing workflow downloads `runner-v1.mjs` by URL, so a
change to that file changes every task that starts afterwards.

## Contract notes

`CodingRunnerTask` carries the one-time `callbackToken` only on the wire; the
control plane persists `hashToken(callbackToken)` and never stores the raw value.
`CodingRunnerLlmRequestSchema` accepts native `tool_calls` on assistant messages,
so the provider sees real function calls and their results rather than a text
serialisation.

`addWorkspace` calls the bootstrap once per repository. When the workflow file is
absent it opens a branch, commits the template and returns a pull-request URL in
`CodingWorkspaceDto.bootstrapPrUrl`, which the page shows before the first task.
The workspace row is written either way, so a member can finish the review and
start a task without reconnecting.

## Eval gate

`evals/coding/tasks.json` holds 12 deterministic fixtures and shell checks.
Changes to the runner prompt or tools require a green run of that suite; the
gate command and the fixture format are documented in
`evals/coding/README.md`. This phase has no native mobile port, so no
`docs/mobile/parity.json` row or Android release note belongs to it.
