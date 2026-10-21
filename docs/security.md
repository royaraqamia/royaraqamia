# Security & Secrets

## Environment variables

- Env lives in `.env.local` (copy from `example.env`); never commit real secrets (`.env` is git-ignored).
- **`NEXT_PUBLIC_*` are NOT secrets** (inlined to client). Everything else is server-only.
- Load from `backend/config/env`, never hardcode.

## Secret vars (never log or leak)

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `SENTRY_AUTH_TOKEN`
- `UPSTASH_REDIS_REST_TOKEN`
- `TURNSTILE_SECRET_KEY`
- `CRON_SECRET`
- `E2E_TEST_PASSWORD`
- `MCP_TOKEN_ENCRYPTION_KEY`
- `github_dispatch_token` (Supabase Vault, not env — see runbook below)

## GitHub Actions secrets

Repository secrets, not environment variables. `shell-release.yml` is the only workflow that uses the
keystore secrets below.

- `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` —
  the Android shell's upload keystore. It is the one credential that cannot be re-derived: a device with
  the app installed will not accept an update signed by a different key, so losing this secret _and_ the
  copy in `D:\Projects\royaraqamia-android-keys` means the app can never be updated again. Rotating it
  means changing the secret and `public/.well-known/assetlinks.json` together, and every installed shell
  has to be replaced by hand (ADR-0045, `docs/mobile/android-shell.md`).

- `SUPABASE_SERVICE_ROLE_KEY` — a copy of the deployment's, because `code-quality.yml`'s `build` job and
  `bundle-size.yml` both run `npm run build`, and that build prerenders routes which read through the
  admin client (`backend/loaders/spendtrack.ts`, `backend/loaders/rates.ts`). It exists in **two scopes**,
  and rotating one does not move the other: **Actions** (pushes, manual runs) and **Dependabot**. A
  Dependabot pull request is handed no Actions secrets at all, so without the Dependabot copy both
  workflows die at `Missing env var: SUPABASE_SERVICE_ROLE_KEY` — which is what every Dependabot pull
  request did until 2026-10-19 (Settings → Secrets and variables → Dependabot).

## Security baseline

- Validate all external inputs via Zod (`shared/contracts`)
- Turnstile on auth forms
- Upstash rate limiting
- Strict TS config (`noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals/Parameters`)
- Keep DB/SDK/3rd-party off the UI boundary

## MCP threat boundary & key rotation

The public MCP server stores a consenting user's Supabase session AES-256-GCM-encrypted
(`session_enc`, ADR 0023). The session is one the server _mints_ for that grant, not a copy of
the browser's — a borrowed token is refused as soon as the browser rotates past it, which is
what used to brick connected clients (ADR 0023 amendment). The encryption key never lives next
to the ciphertext:
it is `MCP_TOKEN_ENCRYPTION_KEY` env, absent from the database. A DB dump alone is useless; a
dump **plus** the key means an attacker can mint real Supabase sessions for MCP-consenting
users, but blast radius stays bounded by:

- RLS (native, user-scoped clients — never service-role impersonation),
- token revocation (`/mcp/revoke`; the access row is re-read on every `/mcp` request, cache hit
  included, so neither `revoked_at` nor a rotation can be outrun by a process-local cache on
  another serverless instance), which also shreds the row's stored bridge ciphertext and signs out
  the Supabase session the grant minted. A signed-in user
  can revoke without holding a client secret from the account area (`/account/connected-apps`,
  `DELETE /api/me/mcp/connected-apps[/{clientId}]`), which is also `revokeAllUserTokens`'s
  production caller and drops the client's live authorization codes, because a code carries a
  bridge ciphertext of its own and exchanges for a fresh pair,
- refresh-token rotation is single-use: the refresh row is claimed with a compare-and-set
  (`.is('revoked_at', null)`) before anything is issued, so two overlapping refreshes mint exactly
  one pair and the loser is answered `invalid_grant`. A replayed, already-rotated token is refused
  the same way,
- the daily pg_cron sweepers: expired/revoked token rows, and claimed/expired authorization-code
  rows. Claiming a code shreds it too (the exchange copied the ciphertext into the token pair it
  issued), so a code's bridge session lives only for the exchange that consumes it.

A disconnect revokes MCP tokens _and_ releases the grant's Supabase session, so a disconnected
client cannot go on reading through a bridge session it no longer owns. Only a session this server
minted is signed out: a bridge ciphertext records its own provenance (ADR 0023's 2026-10-14
amendment), and a pre-amendment row holds a copy of the user's _browser_ session, which is left
alone — signing it out would sign them out of the website. Retirement paths make no such call,
because GoTrue has already invalidated those sessions or the ciphertext will not decrypt.

All MCP routes (`/mcp`, `/register`, `/token`, `/authorize`, `/revoke`, `/connect/consent`)
are Upstash-limited (fail-closed); registration also enforces https-only redirect URIs with a
localhost exception (ADR 0022).

### Runbook: rotating `MCP_TOKEN_ENCRYPTION_KEY`

1. Generate a new 64-char hex key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Replace the value in the deployment env and redeploy. Old `session_enc` rows immediately
   become undecryptable — that is the intended kill switch, not a bug.
3. Connected MCP clients get 401 on next use; the data plane retires the grant (access + refresh
   rows) so the client's next refresh is answered `invalid_grant` and it reaches its
   re-authorize path instead of the silent retry that used to loop. OpenCode models that state
   separately from a hard failure (a `needs_auth` status), so the user is asked to authorize
   rather than shown a broken server; no manual DB cleanup is required (the sweeper prunes dead
   rows at 03:30 daily).
4. Suspected key compromise: perform steps 1–2 AND delete every row in `mcp_oauth_tokens`/
   `mcp_oauth_auth_codes`, then treat the incident as a user-session compromise: rotate
   Supabase secrets, audit admin actions, notify ADMIN_EMAILS users.

## GitHub dispatch token (issue automation)

The pg_cron dispatcher (`public.dispatch_github_workflow`, migration
`20261010131500_dispatch_github_workflows.sql`, ADR 0032) wakes the agent workflows by
calling the GitHub Actions dispatch API. It authenticates with a fine-grained PAT stored in
the Supabase Vault as `github_dispatch_token` (repo slug in `github_dispatch_repo`), never in
an env var or the repository. If the secret is absent the function no-ops safely and the
pipeline falls back to GitHub's own schedule plus the health monitor.

Blast radius is bounded to **starting** workflows on this one repository: a workflow a dispatch
starts still acts under its own scoped `GITHUB_TOKEN`, and the per-workflow day-guard and
concurrency groups bound how much a single dispatch can do. The dispatcher holds no repository
contents power of its own. The credential is ideally a **dedicated** fine-grained PAT scoped to
this repository with only `Actions: write`; if the stored PAT is instead the repo automation
token, a Vault compromise equals that broader token's scope — rotate to a dedicated token, and
treat any `github_dispatch_token` leak as a leak of whatever PAT is stored.

### Runbook: rotating `github_dispatch_token`

1. Create a new fine-grained PAT scoped to `royaraqamia/royaraqamia` with only `Actions: write`.
2. Update the Vault secret:
   `select vault.update_secret((select id from vault.secrets where name = 'github_dispatch_token'), '<new-pat>');`
   (use `vault.create_secret` if it was never provisioned).
3. The next pg_cron run picks it up; nothing to redeploy.
4. Suspected compromise: rotate as above, then review the repository's Actions run log for
   unexpected `workflow_dispatch` runs and treat it as a trigger-abuse incident.
