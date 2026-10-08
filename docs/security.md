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

## Security baseline

- Validate all external inputs via Zod (`shared/contracts`)
- Turnstile on auth forms
- Upstash rate limiting
- Strict TS config (`noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals/Parameters`)
- Keep DB/SDK/3rd-party off the UI boundary

## MCP threat boundary & key rotation

The public MCP server stores consenting users' Supabase refresh tokens AES-256-GCM-encrypted
(`session_enc`, ADR 0023). The encryption key never lives next to the ciphertext: it is
`MCP_TOKEN_ENCRYPTION_KEY` env, absent from the database. A DB dump alone is useless; a dump
**plus** the key means an attacker can mint real Supabase sessions for MCP-consenting users,
but blast radius stays bounded by:

- RLS (native, user-scoped clients — never service-role impersonation),
- token revocation (`/mcp/revoke` + `revoked_at` on every use),
- the daily pg_cron sweeper deleting expired/revoked rows.

All MCP routes (`/mcp`, `/register`, `/token`, `/connect/consent`) are Upstash-limited
(fail-closed); registration also enforces https-only redirect URIs with a localhost exception
(ADR 0022).

### Runbook: rotating `MCP_TOKEN_ENCRYPTION_KEY`

1. Generate a new 64-char hex key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Replace the value in the deployment env and redeploy. Old `session_enc` rows immediately
   become undecryptable — that is the intended kill switch, not a bug.
3. Connected MCP clients get failures/401 on next use and must re-run the OAuth browser flow
   (auto-triggered); no manual cleanup required (sweeper prunes dead rows at 03:30 daily).
4. Suspected key compromise: perform steps 1–2 AND delete every row in `mcp_oauth_tokens`/
   `mcp_oauth_auth_codes`, then treat the incident as a user-session compromise: rotate
   Supabase secrets, audit admin actions, notify ADMIN_EMAILS users.
