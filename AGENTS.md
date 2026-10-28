# Project Agent Contract — royaraqamia

Next.js 16 (App Router) + React 19 + TypeScript 7 (strict) + Tailwind CSS 4. Multiple products (Community, Certificates, Consultations) + Auth on Supabase Postgres 17.

**Package manager:** npm >= 10 (`legacy-peer-deps=true` in `.npmrc`)

**Critical commands (run before any task):**

- `npm ci` — install deps
- `npx tsc --noEmit` — type check
- `npm run lint` — lint (ESLint); `npm run lint:fix` to auto-fix
- `npm run format` — Prettier; CI gates on `format:check`, and ESLint does not format
- `npm test` — unit tests (Vitest)
- `npm run build` — full build (requires `NEXT_PUBLIC_WHATSAPP_PHONE`)

**Scope them to the change.** Routine work runs `npm run typecheck`, `npm run lint:fix` and only the tests the diff reaches (`npx vitest run <path>`, or `npx vitest run --changed`). The full `npm test` and `npm run build` are for a genuinely repo-wide change, a change that could plausibly break the build, or CI. Details: [docs/agents/landing.md](docs/agents/landing.md).

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

**Work in a worktree — never commit in a tree another agent may be writing to.** The canonical checkout is shared, and concurrent `git` there has silently lost a commit and published other agents' unpushed work. Create a worktree from local `main` — `worktree_create`, or `git worktree add -b <task> <dir> main` after the landing sync (never `origin/main`, [ADR-0072](docs/adr/0072-worktrees-are-cut-from-local-main.md)) — land your work by pushing from it, then remove it. Setup and cleanup: [docs/agents/worktrees.md](docs/agents/worktrees.md).

**Core architecture rule:** `controller → service → repository/client`. Controllers are thin. Repositories are the only code that knows the DB. All DI wiring in `backend/config/`.

**Digits are ASCII, always.** Type `0-9`, never Arabic-Indic (U+0660–U+0669) or Persian (U+06F0–U+06F9) numerals — in source, docs, UI copy, tests and stored content. `npm run check:digits` gates it and `npm run fix:digits` rewrites. Read-only numbers render in Aref Ruqaa through `--font-digits`; editable fields opt back out. Runtime input goes through `toLatinDigits` in `shared/contracts/text.ts`.

**Edge middleware lives in `proxy.ts`** (repo root) — Next.js 16 renamed `middleware.ts` to `proxy.ts` (exported function `proxy`). There is **no `middleware.ts`**; don't go looking for one. It runs `backend/middleware/session.ts` (`updateSession`) + the country cookie.

**Arabic copy:** write «جاري» (final ya), never «جارٍ» (tanween). `npm run check:arabic` enforces it and `npm run fix:arabic` rewrites it; ADR 0054 records why.

**Definition of done — land the work, every time.** A task is not finished when the code works; it is finished when the change is committed, pushed, open as a pull request, and squash-merged into local `main` — subject `"<PR title> (#N)"`, body = the branch's reasoning — with the pull request itself never touched after it opens: `gh pr merge`, auto-merge and `--delete-branch` stay the repository owner's manual step, and an agent never runs them. Leave the worktree and branch in place (the pull request needs the branch); the reconcile — a local squash whose PR GitHub has since merged is stale and is dropped at the start of the next task — is landing.md step 1. Sequence and conventions: [docs/agents/landing.md](docs/agents/landing.md). One-shot: `/land`.

## Detailed references

- [Architecture & layering](docs/architecture.md)
- [Commands & deployment](docs/commands.md)
- [Supabase & migrations](docs/supabase.md)
- [Security & secrets](docs/security.md)
- [Conventions & style](docs/conventions.md)
- [Performance baseline & budget](docs/performance.md)
- [Vercel usage budget (Hobby)](docs/vercel-usage.md)
- [Available skills](docs/skills.md)
- [Android shell (APK / AAB)](docs/mobile/android-shell.md)
- [Working in a worktree](docs/agents/worktrees.md)
- [Landing the work](docs/agents/landing.md)

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`royaraqamia/royaraqamia`). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map to their own names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (one `CONTEXT.md` + `docs/adr/` at the repo root). See `docs/agents/domain.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
