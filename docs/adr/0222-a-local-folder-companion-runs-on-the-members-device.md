# 0222. A local folder companion runs on the member's device

## Status

Accepted (2026-11-26). Phase 2 of
[ADR-0219](./0219-the-assistant-delegates-code-to-a-sandboxed-runner.md) (the
sandboxed coding runner). Settles the six decisions issue #1904 left open; the
first slice ships the pairing grant, the companion CLI and the local task
protocol.

## Context

Phase 1 connects a GitHub repository and runs the agent in the member's own
Actions job. A member with no GitHub repository — or with a folder that is not a
repository at all — has no path into the feature. ADR-0219 already named the
answer: "a local companion for folders on the member's device; the folder grant
and credentials stay on that device."

The control plane still cannot host that code. The deployment is one free Node
service with no Docker and no worker; running member code there would put a
member's files beside the platform's Supabase key and every other member's data.
Phase 1's separation is therefore not optional here: the companion is a second
execution plane, and the control plane only ever sees progress frames.

The decisions below are the ones the issue listed. Each is recorded with the
alternative it rejected, because a phase-3 change should have to argue with
this text rather than rediscover it.

## Decision

1. **The companion is a CLI, not a desktop app.** One dependency-free Node 22
   script served at `/coding/noor-local.mjs`, downloaded with the command the
   page prints. It matches phase 1's runner in shape and distribution, needs no
   signing, notarisation or update channel, and works wherever the member's
   toolchain works. A desktop shell can wrap the same protocol later without
   changing the control plane; building one now would buy a window, not a
   capability.

2. **A folder is granted by a one-time pairing code, and the path never leaves
   the device.** The member creates a code in the coding page (`POST
/api/coding/local/pairs`): it is shown once, stored as a digest, and expires
   in ten minutes. The companion runs inside the folder and trades the code for
   a long-lived grant token (`POST /api/coding/local/pairs/claim`); only the
   token's digest is stored, and the request carries a device label, never a
   path. The grant is per folder, per device, revocable from the page
   (`DELETE /api/coding/local/grants/<id>`), and the revocation fails the tasks
   still in flight on that device. Deleting the workspace revokes its grant too.

3. **The model key stays on the control plane.** A local task calls the same
   `/api/coding/runner/llm` route as the Actions runner, with the same per-task
   token and the same plan caps. The device holds no model credential, so a
   stolen laptop loses a revocable grant and nothing else, and the cost caps
   from ADR-0219 decision 7 keep applying. A member-supplied provider key is a
   later, separate decision: it changes who pays and which data leaves the
   device.

4. **Progress is the phase-1 callback protocol, not a new socket.** The
   companion claims a queued task (`POST /api/coding/local/tasks/claim`) and
   receives the same `CodingRunnerTask` the workflow gets, with `kind: "local"`
   and no repository, branch or installation token. It runs the same
   `runner-v1.mjs`, which posts plan, edit, test and review frames through
   `/api/coding/runner/update`. The plan gate and the token and time budgets are
   unchanged. `review` is the one new step kind: it carries the unified diff the
   member reads on the task page, and posting it completes the task.

5. **Local work is a diff in the member's folder, and nothing is pushed.** The
   folder must be a git repository with a clean working tree; the preflight runs
   before the first model call. The agent may read, write, patch and run the
   allow-listed commands, but git commands that change the index, history or
   refs are refused in local mode, and there is no push step at all. The diff
   the companion reports is therefore exactly the agent's work, `git checkout .`
   is a complete rollback, and the member's commit is the acceptance decision.
   Plan-first remains the default, so a first run proposes before it writes.

6. **Offline is a queued task, not a failed one.** A task created against a
   local workspace stays `queued` until a paired device claims it; nothing runs
   while the companion is stopped, and no server-side worker holds it. The
   companion polls with backoff and exits cleanly when the origin is
   unreachable. One device owns one grant and one folder, so two laptops are two
   grants; a task is claimed atomically by exactly one of them, and a second
   device sees an empty queue rather than the same task.

7. **The backend never mounts a folder.** The grant table is `service_role` only,
   exactly like `coding_installations`, because a grant token is a credential.
   The public routes accept a bearer that only resolves to a row's digest; no
   route reads a file, lists a directory or spawns a process. The security
   claim is structural: there is no code path from the backend to a member's
   filesystem to review.

## Why not the alternatives

- **A desktop app first.** Signing, auto-update and three platforms before the
  protocol works; the CLI proves the same contract with a tenth of the surface.
- **Sending the folder path to the server for display.** A path is a map of the
  device; the display name and the label the member typed are enough, and the
  server cannot leak what it never received.
- **A server-side worker that connects back into the folder.** Reintroduces the
  boundary ADR-0219 removed: the chat service would hold a way into member code.
- **Committing a checkpoint in the member's repository.** The companion would
  silently author history the member did not write, and a dirty tree would make
  the reviewed diff ambiguous. The diff plus a required clean tree is stricter
  and simpler.
- **Reusing the GitHub installation token for local work.** There is no
  repository and no installation; the grant is the only credential a device
  needs, and it is revocable without touching GitHub.

## Consequences

- The public backend gains routes, a migration and a table, but no executable
  member code and no new long-lived repository credential.
- The companion is a second distribution artefact. Both scripts are served at
  versioned URLs, so a deployment changes what the next member downloads; an
  installed companion keeps working against the same routes until a contract
  change says otherwise. Nothing is replaced on the device without the member
  downloading it.
- A local task still spends the member's monthly task allowance and token caps.
  The device's own compute is free to the platform, so no runner-minute charge
  applies to local work.
- Phase 1's runner script gains a `local` branch. The GitHub path is unchanged
  and its tests still pass; the new branch is guarded by `kind` at load time.
- There is no native port: the task list and detail views remain document
  surfaces, so `docs/mobile/parity.json` gains no row and no Android release note
  is needed. The companion is a CLI, not an app surface.
- Multi-repository workspaces and a reviewer agent stay in phase 3
  (issue #1905), where the same grant protocol can be extended per folder
  without a new credential model.
