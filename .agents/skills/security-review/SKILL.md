---
name: Security review
description: Audit a change for this repository's security boundaries — RLS and grants, secrets, the MCP threat boundary, GitHub tokens, and the Telegram bot's write path. Use when a change touches Supabase tables or policies, authentication, an API route, a workflow, or anything that can write to production.
---

## What to audit, in this order

1. **Database access.** Every new table gets `enable row level security`, a policy per operation that names the row's owner, and `revoke all ... from anon, authenticated` unless a member is meant to read it. A service-role client is not a shortcut: the only code allowed to hold it is `backend/repositories` through `backend/config`. Look for it in a route handler, a loader that a page renders, or an edge function.
2. **Secrets.** `NEXT_PUBLIC_*` is inlined into the browser; anything else is server-only. `docs/security.md` lists the secrets and their runbooks. A new secret is added in three places at once: the deployment env, the workflow that needs it, and that document.
3. **The MCP boundary.** A session minted for an MCP grant is AES-256-GCM encrypted with a key that never lives beside the ciphertext, revocation is re-read on every request (never cached), and refresh is single-use. A change that caches a token row, copies a browser session, or skips the revoke check is a compromise path, not an optimisation.
4. **GitHub tokens.** `GITHUB_TOKEN` reaches one repository and starts no workflow when it pushes. A push that must be measured uses `AGENT_PUSH_TOKEN`. A job that can merge or push holds `contents: write`; every other job does not. Check `permissions:` on the job, not on the workflow.
5. **The Telegram bot's write path.** The bot must not be able to push, merge or deploy production on its own: the shims in `scripts/telegram/guard-decision.mjs` refuse those commands, `AGENT_PUSH_TOKEN` is stripped from the agent's environment, and a merge needs two taps (`telegram_confirmations`, thirty minutes). A change that hands the agent a broader token, or merges without a confirmation row at step 2, undoes all three.
6. **Untrusted input.** Anything from a chat message, a URL the bot fetched, a model answer, or a webhook body is untrusted. It is validated (Zod in `shared/contracts`), never concatenated into SQL, never passed as an HTML attribute without `escapeHtml`, and never executed.
7. **Dependencies.** A new package is a supply-chain decision: check the publisher, the install scripts, and whether the standard library or an existing dependency already does the job.

## What to report

One finding per line, worst first, each with the file and line, the concrete consequence, and the smallest fix. No severity theatre and no "consider" — either it is exploitable or it is not.

- **Blocking:** a path from an untrusted input to a write, a secret, or a privilege.
- **Should fix:** a missing policy, an over-broad token, a cached revocation, a secret in a log.
- **Note:** a hardening idea with no exploit behind it.

## How to check without guessing

```bash
npm run check:digits && npm run check:arabic && npm run check:fusha
```

- Policies and grants: `supabase/migrations/*.sql` — grep the table name across every migration, the last one wins.
- Workflow permissions: `.github/workflows/*.yml` — read `permissions:` under the job that runs the command.
- Secrets: `docs/security.md` is the register; a secret missing from it is a finding.
- The bot: `scripts/telegram/` — `guards.mjs`, `answer.mjs`, `publish.mjs`, `merge.mjs` in that order.

Never run a destructive check against the live project to prove a finding. If the finding needs a live measurement, write the query, state the expected result, and ask.
