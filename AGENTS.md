# Project Agent Contract — royaraqamia (رؤية رقمية)

Per-project facts that make all installed skills executable for THIS repo. Authoritative source: `README.md`.

## Available Skills (use proactively when task matches)

### Core Engineering (mattpocock/skills)

- `plan` — Architecture/blueprint for new features (MUST run before implement on non-trivial tasks)
- `implement` — Execute approved blueprint
- `implement-spec` — Implement a specification in code
- `review` — Rigorous QA: typecheck, lint, test, build, E2E
- `code-review` — Review branch/PR against standards + spec
- `codebase-design` — Deep module design, seams, testability
- `improve-codebase-architecture` — Scan for deepening opportunities
- `tdd` — Test-driven development
- `diagnosing-bugs` — Hard bugs/performance regression loop
- `domain-modeling` — CONTEXT.md, ADRs, terminology
- `grilling` / `grill-me` / `grill-with-docs` — Stress-test plans
- `to-spec` / `to-tickets` / `triage` / `wayfinder` — Spec → tickets → tracker
- `prototype` — Throwaway prototypes for design questions
- `research` — Delegate reading legwork to background agent
- `wizard` — Interactive bash wizards for human-only steps
- `handoff` / `claude-handoff` — Compact context for next agent
- `retro` — Session retrospective
- `ask-matt` — Router: which skill/flow fits your situation
- `code-refactorer` — Restructure working code to clean layered architecture (SOLID)
- `setup-matt-pocock-skills` — Configure repo for engineering skills (issue tracker, triage labels, domain docs)

### Vercel & Deployment (vercel-labs/agent-skills)

- `deploy-to-vercel` — Deploy to Vercel (preview/production)
- `vercel-cli-with-tokens` — Token-based Vercel CLI auth
- `vercel-optimize` — Cost/performance optimization (Next.js, SvelteKit, Nuxt)
- `vercel-react-best-practices` — React/Next.js perf patterns
- `vercel-composition-patterns` — Compound components, context, render props
- `vercel-react-view-transitions` — View Transition API animations
- `vercel-react-native-skills` — React Native/Expo best practices
- `web-design-guidelines` — UI audit: accessibility, UX, best practices
- `writing-guidelines` — Docs/prose review

### Supabase & Database (supabase/agent-skills)

- `supabase` — All Supabase: Database, Auth, Edge Functions, Realtime, Storage, Vectors, Cron, Queues, migrations, SSR (@supabase/ssr)
- `supabase-postgres-best-practices` — Schema, RLS, indexes, migrations, pgvector, pg_cron, performance

### UI/Design (ui-ux-pro-max)

- `ui-ux-pro-max` — 84 styles, 192 palettes, 74 font pairings, UX guidelines
- `ui-styling` — shadcn/ui + Radix + Tailwind, accessible components
- `design-system` — Token architecture (primitive→semantic→component)
- `frontend-design` — Distinctive visual design, typography, aesthetic direction
- `design` — Brand identity, logo, CIP, mockups, slides, banners, icons
- `slides` — Strategic HTML presentations with Chart.js, design tokens, responsive layouts
- `banner-design` — Social/ads/web/print banners (22 styles)
- `brand` — Voice, visual identity, messaging, compliance

### Productivity & Writing

- `writing-beats` / `writing-fragments` / `writing-shape` / `writing-for-agents` — Structured writing
- `teach` — Teach concepts in workspace
- `setup-pre-commit` — Husky + lint-staged + typecheck + tests
- `setup-ts-deep-modules` — dependency-cruiser for deep modules
- `migrate-to-shoehorn` — Replace `as` assertions in tests
- `git-guardrails-claude-code` — Block destructive git commands
- `scaffold-exercises` — Exercise directory structures
- `resolving-merge-conflicts` — Merge/rebase conflict resolution
- `wait-what` — Re-pitch unclear messages
- `loop-me` — Grill on workflow specs
- `to-questionnaire` — Delegate decisions

## Project identity

- **Name:** رؤية رقمية (royaraqamia)
- **Primary stack / platform:** Next.js 16 (App Router) + React 19 + TypeScript 7 (strict) + Tailwind CSS 4. Single web deployment, multiple SaaS products (Blog, BlogPress, HabitFlow, LinkSnap, SpendTrack, Certificates) + Auth.
- **Language / runtime / SDK:** Node 22 LTS (CI-verified), npm >= 10 with `.npmrc` `legacy-peer-deps=true`. Supabase Postgres 17.
- **Monorepo layout:**
  - `app/` — Next.js App Router: pages, layouts, route handlers (product routes live under `app/<product>/`).
  - `backend/` — Clean/hexagonal architecture (ports & adapters). Dependency rule: `controller → service → repository / client`.
  - `frontend/` — Client-side by layer: `api/`, `state/`, `transport/`, `shared/`, `ui/`.
  - `shared/contracts/` — API contract: Zod schemas + TS types imported by both sides.
  - `supabase/migrations/` — versioned SQL migrations (schema, RLS, storage).
  - `e2e/` — Playwright tests.
  - `data/`, `public/`, `scripts/` — static content / assets / tooling.

## Commands (source of truth for the review skill)

- **Install deps:** `npm ci`
- **Type check:** `npx tsc --noEmit`
- **Lint:** `npm run lint` (ESLint); `npm run lint:fix` to auto-fix
- **Format check:** `npx prettier --check .`; `npm run format` to write
- **Unit tests:** `npm test` (Vitest, once); `npm run test:watch`; single file: `npx vitest run <path>`
- **Integration/E2E tests:** `npm run test:e2e` (Playwright; needs `E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD`). `npx playwright test --grep responsive` for viewport suite.
- **Build:** `npm run build` (icons → compute version → `tsc --noEmit` → `next build`). Requires `NEXT_PUBLIC_WHATSAPP_PHONE`.
- **Env docs check:** `npm run check:env-docs`
- **Version next rehearsal:** `npm run version:next`

## Vercel Deployment (production readiness)

- **Deploy preview:** `vercel deploy` (or use `deploy-to-vercel` skill)
- **Deploy production:** `vercel deploy --prod` (or use `deploy-to-vercel` skill with target=production)
- **Linked project:** Use `vercel create_git_project` for repo-linked auto-deploys
- **Environment variables:** Manage via Vercel dashboard or `vercel env add`
- **Performance audit:** Use `vercel-optimize` skill before major releases
- **Domain management:** `vercel domains` / `vercel buy_domain`

## Supabase Operations (production readiness)

- **Local dev:** `supabase start` / `supabase db push` / `supabase migration new`
- **Remote migrations:** Write NEW timestamped file in `supabase/migrations/` FIRST, then `supabase db push` (mirror discipline)
- **Advisors check:** Run `supabase_get_advisors` (security + performance) after schema changes
- **RLS testing:** Verify policies with `supabase list_tables verbose=true`
- **Edge functions:** `supabase functions deploy <name>` (verify_jwt=true by default)
- **Backups/Point-in-time:** Configure in Supabase dashboard (not CLI)

## Release versioning (automated pipeline)

- **Scheme:** `<X.Y.Z>+build.<N>.<7-char-sha>`. Core `X.Y.Z` from committed `package.json#version` (workflow-maintained, `APP_VERSION` env override available); `N` = commits since last tag; sha from `VERCEL_GIT_COMMIT_SHA` → git → `unknown`.
- **Bump rules (conventional commits):** breaking/`!` → major, `feat` → minor, anything else → patch. Non-conventional → patch, never fails.
- **Generated module:** `backend/config/generated/app-version.ts` is regenerated by `prebuild`/`predev` **on CI/Vercel only** (local runs keep the committed default pristine, override with `APP_VERSION_WRITE=force`; the committed default keeps fresh-clone dev/tests/tsc working). Do not hand-edit.
- **Flow:** push to `main` → code-quality → `.github/workflows/release.yml` (gated: push on `main`) → bump/tag/`chore(release)` commit `[skip ci]` → Vercel deploys → `/api/version` exposes `releaseVersion`.
- **Never edit the release logic** (`scripts/compute-version.mjs`, `scripts/release-tools.mjs`) without updating their co-located tests in `scripts/__tests__/`.

## Skill Versioning (skills-lock.json)

- **Pinned skills:** All installed GitHub-sourced skills are locked in `skills-lock.json` with content hashes
- **Sources covered:** `mattpocock/skills`, `vercel-labs/agent-skills`, `supabase/agent-skills`
- **Update flow:** Re-run skill installer when upstream releases new versions; commit updated `skills-lock.json`
- **Never edit hashes manually** — they're computed from skill content for integrity

## Conventions to respect (override agent guesswork)

- **Layering (critical).** Flow is `controller → service → repository/client`; controllers are thin (parse → call ONE service → shape response), no business logic. Services depend on interfaces, never HTTP/SQL directly. **Repositories are the only code that knows the DB.** All DI wiring centralized in `backend/config/` factory functions. Server-side data loaders for RSC in `backend/loaders`.
- **SDK isolation:** Supabase `.from()` / external calls stay in `backend/repositories` / `backend/clients` (behind interfaces) and `frontend/transport` — never in UI components.
- **Feature folders:** product code in `app/<product>/`, `frontend/ui/<product>/`, `backend/services/<product>/`, `backend/repositories/<product>/`.
- **Shared contracts:** request/response shapes defined in `shared/contracts` (Zod), not duplicated.
- **Naming / style:** Prettier config — `singleQuote`, `semi`, `printWidth: 100`, `trailingComma: es5`, `tabWidth: 2`, `endOfLine: lf`. Arabic primary (RTL). Marker-file identity: `*__tests__*` for test co-location.
- **No direct console logging:** `console.error/warn` outside `backend/shared/logger` / `frontend/shared/logger` is forbidden — use the structured loggers.
- **UI:** RTL-first; design tokens/CSS custom properties; Radix + shadcn primitives; no inline styles.

## Data & persistence

- **Database:** Supabase (PostgreSQL 17, Auth, Storage, Realtime).
- **RLS / access control:** RLS on tables; admin-only writes via `ADMIN_EMAILS` allowlist + `backend/shared/admin-validator`; service-role key is server-only and never in the browser.
- **Migrations convention:** incremental timestamped files in `supabase/migrations/`, applied in filename order via `supabase db push`. **Never edit an applied migration.** The base schema lives only on the remote project (first migration `20260718105449` is an intentional stub) — add new changes as NEW migration files only.

### CI agent database rules (OpenCode workflows, when Supabase MCP is connected)

- The agent may inspect the live project (`list_tables`, `list_migrations`, `get_advisors`, logs) and apply schema changes **only** through `apply_migration`.
- Mirror discipline: write the identical SQL as a NEW timestamped file in `supabase/migrations/` FIRST, then apply it remotely with the same name — remote history must always match the repository.
- Forbidden without explicit human approval in the trigger comment: destructive DDL (`DROP TABLE/COLUMN`, `TRUNCATE`), disabling or weakening RLS, modifying `auth.users` data, storage bucket changes, data backfills over user tables.
- Prefer additive, reversible migrations; include a rollback note in the PR body for any applied migration.

## Secrets & environment

- Env lives in `.env.local` (copy from `example.env`); never commit real secrets (`.env` is git-ignored).
- **`NEXT_PUBLIC_*` are NOT secrets** (inlined to client). Everything else is server-only.
- **Secret vars, never log or leak:** `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `SENTRY_AUTH_TOKEN`, `UPSTASH_REDIS_REST_TOKEN`, `TURNSTILE_SECRET_KEY`, `E2E_TEST_PASSWORD`.
- Send a `.runnable` check first: build + type-check need `NEXT_PUBLIC_WHATSAPP_PHONE`; tests inject test values automatically.

## Security baseline (confirm unless overridden)

- Validate all external inputs via Zod (`shared/contracts`); Turnstile on auth forms; Upstash rate limiting; strict TS config (`noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals/Parameters`).
- Keep DB/SDK/3rd-party off the UI boundary.
- Never hardcode secrets; load from `backend/config/env`.

## Git discipline

- **Branch/PR:** match repo style (CI gates merges on main/master).
- **Commit style:** conventional commits (feat/fix/test/style/…) as seen in history; concise imperative.
- **Micro-commits:** one atomic unit per commit; never commit red; never destructive (reset/force-push).

## Definition of done (overlaps review skill)

- Plan skill exit criteria pass.
- `npx prettier --check .`, `npm run lint`, `npx tsc --noEmit`, `npm test`, and `npm run build` all green.
- E2E (Playwright) green when the change touches covered flows.
- No secrets leaked; RLS / access control preserved; new DB change added as a new migration file.
