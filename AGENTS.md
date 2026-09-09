# Project Agent Contract — royaraqamia

Next.js 16 (App Router) + React 19 + TypeScript 7 (strict) + Tailwind CSS 4. Multiple products (Blog, Certificates, Consultations) + Auth on Supabase Postgres 17.

**Package manager:** npm >= 10 (`legacy-peer-deps=true` in `.npmrc`)

**Critical commands (run before any task):**

- `npm ci` — install deps
- `npx tsc --noEmit` — type check
- `npm run lint` — lint (ESLint); `npm run lint:fix` to auto-fix
- `npm test` — unit tests (Vitest)
- `npm run build` — full build (requires `NEXT_PUBLIC_WHATSAPP_PHONE`)

**Core architecture rule:** `controller → service → repository/client`. Controllers are thin. Repositories are the only code that knows the DB. All DI wiring in `backend/config/`.

## Detailed references

- [Architecture & layering](docs/architecture.md)
- [Commands & deployment](docs/commands.md)
- [Supabase & migrations](docs/supabase.md)
- [Security & secrets](docs/security.md)
- [Conventions & style](docs/conventions.md)
- [Available skills](docs/skills.md)

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`royaraqamia/royaraqamia`). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout (one `CONTEXT.md` + `docs/adr/` at the repo root). See `docs/agents/domain.md`.
