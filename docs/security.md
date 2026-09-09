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
- `E2E_TEST_PASSWORD`

## Security baseline

- Validate all external inputs via Zod (`shared/contracts`)
- Turnstile on auth forms
- Upstash rate limiting
- Strict TS config (`noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals/Parameters`)
- Keep DB/SDK/3rd-party off the UI boundary
