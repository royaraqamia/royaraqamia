# Project Agent Contract — royaraqamia

Next.js 16 (App Router) + React 19 + TypeScript 7 (strict) + Tailwind CSS 4. Multiple products (Community, Certificates, Consultations) + Auth on Supabase Postgres 17.

**Package manager:** npm >= 10 (`legacy-peer-deps=true` in `.npmrc`)

**Critical commands (run before any task):**

- `npm ci` — install deps
- `npx tsc --noEmit` — type check
- `npm run lint` — lint (ESLint); `npm run lint:fix` to auto-fix
- `npm test` — unit tests (Vitest)
- `npm run build` — full build (requires `NEXT_PUBLIC_WHATSAPP_PHONE`)

**Dev server (agents): `npm run dev` (→ `scripts/dev.mjs`) never exits — never run it as a foreground/blocking shell command.**

1. **Prefer Playwright.** Its `webServer` (`playwright.config.ts:73`) starts the server, waits for port `3000`, and tears it down for you. Run browser work as a Playwright test instead of hand-managing the server. (`reuseExistingServer: false` means a stale server on `3000` will fail the run — free the port first.)
2. **One-off scripts hitting the real server:** use a **single bounded command** that frees port 3000 (a stale server serves old code), starts detached, waits on the port with a deadline, runs your work, then always kills the tree. Shell state does **not** survive between tool calls, so keep it in one call (or persist the PID to a file):

```powershell
# free port 3000 + clear stale logs (avoids stale code / false readiness); run from the repo root
Get-NetTCPConnection -LocalPort 3000 -State Listen -EA SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -EA SilentlyContinue }
$log = "$env:TEMP\dev.log"; Remove-Item $log -EA SilentlyContinue
$p = Start-Process node -ArgumentList 'scripts/dev.mjs' -WorkingDirectory . -RedirectStandardOutput $log -RedirectStandardError "$env:TEMP\dev.err" -PassThru
# wait for HTTP readiness, capped so the call always returns (poll the port, not the log)
$deadline = (Get-Date).AddSeconds(90)
do { Start-Sleep 2 } while (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -EA SilentlyContinue) -and (Get-Date) -lt $deadline)
# <your node/playwright command against http://localhost:3000>
taskkill /PID $p.Id /T /F
```

**Core architecture rule:** `controller → service → repository/client`. Controllers are thin. Repositories are the only code that knows the DB. All DI wiring in `backend/config/`.

**Edge middleware lives in `proxy.ts`** (repo root) — Next.js 16 renamed `middleware.ts` to `proxy.ts` (exported function `proxy`). There is **no `middleware.ts`**; don't go looking for one. It runs `backend/middleware/session.ts` (`updateSession`) + the country cookie.

## Detailed references

- [Architecture & layering](docs/architecture.md)
- [Commands & deployment](docs/commands.md)
- [Supabase & migrations](docs/supabase.md)
- [Security & secrets](docs/security.md)
- [Conventions & style](docs/conventions.md)
- [Performance baseline & budget](docs/performance.md)
- [Available skills](docs/skills.md)

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`royaraqamia/royaraqamia`). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map to their own names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (one `CONTEXT.md` + `docs/adr/` at the repo root). See `docs/agents/domain.md`.
