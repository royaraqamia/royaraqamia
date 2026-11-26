# 0219. The assistant delegates code to a sandboxed runner

## Status

Accepted. Sets the architecture for the coding-agent capability; the first slice
ships the GitHub Actions runner.

## Context

نور is a public chat assistant. Today every tool it owns is either a read of the
member's own product data or a write that becomes a confirmation card
(ADR-0180). There is no shell, no file editing, no git and no code execution in
its path (`backend/services/chat/chat-agent-tool-execution.ts`), and ADR-0137 is
explicit that it is not an OpenCode session. The OpenCode coding agent that
builds this repository has a worktree, a shell and git; that authority must
never leak into the public chat service.

Members want a coding agent: open a folder on their device or connect a GitHub
repository, let نور read it, run commands, edit files, commit, push, open pull
requests and test — with the same reliability they expect from a senior
engineer. That means running code the model wrote, on behalf of a member, in a
multi-tenant product.

The deployment cannot host that code. `render.yaml` declares one free native
Node service: 0.1 CPU, a 384 MB heap, no Docker, no worker (ADR-0174). ADR-0214
already refused a server-side URL fetch for SSRF and cost reasons; arbitrary
member code is a strictly larger boundary. Running it beside the chat service
would put a member's code, the platform's Supabase keys and every other
member's data in one process.

Industry practice separates the two planes. Codex offers CLI and cloud
containers with Suggest / Auto-Edit / Full-Auto approvals and a reviewer agent
for sandbox-boundary requests; Claude Code offers local CLI and web sessions in
configured sandboxes; Copilot's coding agent works in an ephemeral Actions
sandbox, lands one branch and one PR with a scoped token; Jules clones into an
isolated cloud VM and opens a PR. None of them execute member code in the
conversational service.

## Decision

1. **Two planes.** The chat service is the control plane: it plans, asks, shows
   diffs and collects confirmations. All code execution happens in an execution
   plane that owns its own workspace and credentials. The control plane never
   mounts a member's filesystem and never holds a long-lived repository
   credential. This capability gets a new ADR-level service boundary; it does
   not grow نور's existing tool registry with execution primitives.

2. **Per-task isolation and least privilege.** One task gets one ephemeral
   workspace and a short-lived credential scoped to one member, one repository,
   one branch and one pull request. Platform secrets, the platform's Supabase
   database and other members' data never enter the workspace. GitHub access is
   through a GitHub App installation token, encrypted at rest with
   `MCP_TOKEN_ENCRYPTION_KEY` and the same hashed-state / encrypted-verifier
   pattern as the MCP connect flow (ADR-0155).

3. **`SandboxRunner` is a port, not a provider.** The control plane depends on
   an interface with `start`, `status`, `logs` and `cancel`. The first adapter is
   a GitHub-hosted Actions runner: an ephemeral, isolated 2-core VM per task,
   billed to the member's own included minutes (2,000/month on GitHub Free,
   3,000 on Pro/Team; public repositories unmetered). The platform owner pays
   nothing for runner compute. Managed microVM providers (E2B, Daytona, Modal)
   remain optional later adapters behind the same port; a self-hosted Docker
   host is rejected because Docker alone is not a safe multi-tenant boundary.

4. **Plan-first is the default.** A task starts read-only: the runner proposes a
   plan and a diff. The member explicitly escalates to local edits inside the
   sandbox, then to external effects. Push, pull request, deploy, installs and
   spend always require a fresh confirmation. The model never decides whether
   to ask (ADR-0180); the tier lives on the tool, not in the model's judgement.

5. **The pull request is the handoff.** Remote work lands as a branch plus a
   draft or full PR that a human reviews and merges. There is no direct push to
   a default branch. Local work, in a later phase, lands as a visible diff the
   member accepts.

6. **Reliability is measured.** Every task must run the repository's own
   typecheck, lint and tests and attach the evidence before it may report done.
   Autonomy is bounded by turn, token, time and cost caps with traces and
   failure codes. Each step is checkpointed as a commit and resettable to the
   task's starting ref. A scored suite of 10-20 deterministic tasks gates
   changes to the runner prompt and tools. A second reviewer model is deferred
   until eval data shows which diffs fail.

7. **Caps follow the plans.** Free (0 USD) and Pro (10 USD per month) both run
   DeepSeek V4.1 Flash. Free gets 3 tasks per month, a 15-minute runner cap and
   a 200k input / 30k output token cap per task. Pro gets 40 tasks per month, a
   30-minute runner cap and a 500k input / 50k output token cap. At the model's
   off-peak price ($0.15/$0.60 per million tokens) that is roughly $0.05 per
   Free task and $0.11 per Pro task in model spend, so 40 Pro tasks cost about
   $4.4 against $10 of subscription — a margin that leaves room for runner
   overage without charging the owner.

8. **No native port in phase 1.** The task list and detail views are document
   surfaces rendered by both clients, so `docs/mobile/parity.json` gains no row
   and no Android release note is needed for this change.

## Delivery order

- Phase 1: GitHub-only, Actions runner, plan/edit approval, verify loop,
  checkpoints, budgets and the eval suite.
- Phase 2: a local companion for folders on the member's device; the folder
  grant and credentials stay on that device
  ([ADR-0222](0222-a-local-folder-companion-runs-on-the-members-device.md)).
- Phase 3: multi-repository workspaces, reviewer agent and wider autonomy
  ([ADR-0223](0223-a-multi-repo-workspace-lands-one-pr-per-repo.md) records the
  decisions, the evidence gate that keeps the reviewer off until it is measured,
  and the fact that wider autonomy is not granted by this phase).

## Consequences

- The public backend gains routes and tables but no executable code from a
  member and no new long-lived credential.
- A member with no GitHub repository cannot use phase 1; the local companion in
  phase 2 is the path for them.
- Actions minutes are the member's resource. The task UI must show the cap
  before the member confirms a run, and a runner that exhausts minutes fails
  the task rather than silently consuming more.
- The `SandboxRunner` port is the seam where a paid provider can be introduced
  without touching the control plane.
