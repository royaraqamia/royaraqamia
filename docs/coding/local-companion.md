# The local folder companion (phase 2)

A member can hand the coding agent one folder on their own device instead of a
GitHub repository. The folder, its files and the device's credentials stay on
that device; the control plane sees a device label, a revocable grant digest and
the same progress frames the Actions runner posts. The decision record is
[ADR-0222](../adr/0222-a-local-folder-companion-runs-on-the-members-device.md).

## The flow

1. In `/coding`, the member enters a device name and presses **إنشاء رمز ربط**.
   The page shows an eight-character code once. Only its digest is stored, and it
   expires in ten minutes.
2. The member runs the printed commands: both scripts are downloaded once into
   `~/.noor`, then the companion is pointed at the folder to grant.

   ```bash
   mkdir -p "$HOME/.noor"
   curl -fsSL https://<origin>/coding/noor-local.mjs -o "$HOME/.noor/noor-local.mjs"
   curl -fsSL https://<origin>/coding/runner-v1.mjs -o "$HOME/.noor/runner-v1.mjs"
   node "$HOME/.noor/noor-local.mjs" pair XXXX-XXXX --api https://<origin> --folder . --label "laptop"
   node "$HOME/.noor/noor-local.mjs" run --api https://<origin>
   ```

   `pair` trades the code for a grant token and writes `~/.noor/config.json`
   (mode 600 on POSIX). `run` polls for queued tasks and never leaves the folder.
   The companion never downloads or replaces the code it runs: an update is the
   member downloading both files again. On Windows PowerShell the first line is
   `ni -Force "$HOME/.noor" | Out-Null` and `curl` is `curl.exe`.

3. The member creates a task against the new local workspace. It stays `queued`
   until the companion claims it. The plan is shown on the task page and waits
   for approval, exactly as in phase 1.
4. When the work is done, the companion posts a `review` step carrying the
   unified diff. The member reviews it on the task page and either commits it or
   discards it with `git checkout .`.

## What the device keeps, and what the server keeps

| Item                      | Device        | Server                      |
| ------------------------- | ------------- | --------------------------- |
| Folder path               | yes           | **never**                   |
| Files and their content   | yes           | never                       |
| Grant token (raw)         | yes           | never                       |
| Grant token digest        | no            | yes                         |
| Device label              | yes           | yes                         |
| Task, steps, diff summary | receives them | yes (the member's own rows) |
| Model key                 | no            | yes                         |

The diff a `review` step carries is sent to the control plane so the member can
read it on the task page. That is the one place file content leaves the device,
and it leaves only for the member's own authenticated page, under the same
retention as a phase-1 step.

## The folder contract

- The folder must be a git repository with a clean working tree. The companion
  refuses otherwise before it spends one model call, because the reviewed diff
  would no longer be exactly the agent's work.
- In local mode the runner refuses `git add`, `commit`, `push`, `reset`,
  `checkout`, `switch`, `restore`, `stash`, `clean`, `merge`, `rebase`,
  `cherry-pick`, `revert`, `branch` and `tag`. Reading commands such as `diff`,
  `status` and `log` remain available.
- Nothing outside the folder is reachable: the existing path guard re-confines
  every read and write to the process's working directory, which is the folder.
- The folder is not copied and not mounted elsewhere. Rollback is the member's
  own `git checkout .`.

## Revocation and deletion

Revoking a device on the page marks the grant and fails the tasks still queued,
running or awaiting a decision on it. The companion's next poll or model call is
refused, and its local config is useless until it pairs again. Deleting a local
workspace revokes its grant in the same step. `node noor-local.mjs unpair`
forgets the local token but does not revoke it — a leaked token is only dead
when the page says so.

## Limits and cost

A local task spends the member's monthly task allowance and the same per-task
token and time caps as phase 1 (`CODING_PLAN_CAPS`). It costs the platform no
runner minutes: the compute is the member's own. The model call still runs
through the control plane's key, so the platform's model spend is bounded by the
same caps.

## Owner setup

No new environment variables. The routes are part of the existing deployment;
the migration `20270109000000_coding_local_companion.sql` adds the grant table
and the workspace kind. The companion and the runner are static files under
`public/coding/`, so a deployment serves them with no extra configuration.
