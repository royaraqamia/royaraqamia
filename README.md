# royaraqamia

> We build websites and applications with an entrepreneurial vision that benefits people; we also provide students and new graduates with comprehensive professional training for building websites and applications.

**royaraqamia** is a private, production-grade monorepo that powers the company's marketing site and a suite of first-party SaaS products — a public blog, an online blog editor (**BlogPress**), a habit tracker (**HabitFlow**), a URL shortener (**LinkSnap**), an expense tracker (**SpendTrack**), and a certificate-verification service — all unified under a single Next.js application, a shared clean-architecture backend, and one Supabase database.

|                    |                                                                 |
| ------------------ | --------------------------------------------------------------- |
| **Stack**          | Next.js 16 · React 19 · TypeScript 7 · Tailwind CSS 4           |
| **Backend**        | Hexagonal architecture (ports & adapters) over Supabase         |
| **Database**       | Supabase (PostgreSQL 17, Auth, Storage, RLS)                    |
| **Infrastructure** | Vercel · Upstash Redis · Resend · Sentry · Cloudflare Turnstile |
| **Testing**        | Vitest (unit/integration) · Playwright (E2E)                    |
| **Language**       | Arabic (primary, RTL)                                           |

---

## Table of Contents

- [Project Description](#project-description)
- [Architecture & Directory Structure](#architecture--directory-structure)
- [Prerequisites & Tech Stack](#prerequisites--tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Running the Test Suite](#running-the-test-suite)
- [Deployment](#deployment)
- [License](#license)

---

## Project Description

The application is a single Next.js 16 (App Router) deployment that serves multiple products from one codebase:

- **Marketing site** — the company's landing page, portfolio, services, and training offerings (`app/page.tsx`).
- **Blog** — public, SEO-oriented articles rendered from Markdown (`app/blog`).
- **BlogPress** — a full WYSIWYG blog editor built on TipTap, with post management (`app/blogpress`).
- **HabitFlow** — habit tracking with calendars, logs, local-first data, and backup (`app/habitflow`).
- **LinkSnap** — URL shortener with bulk creation, click analytics, admin moderation, and redirects (`app/linksnap`, `app/[code]`).
- **SpendTrack** — expense tracking with categories and charts (`app/spendtrack`).
- **Certificates** — certificate issuance, admin management, and QR-based public verification (`app/admin/certificates`, `app/verify`).
- **Auth & Accounts** — OTP-based email authentication, password reset, and admin role management (`app/auth`).

The backend is intentionally decoupled from Next.js: business logic lives in `backend/services`, data access behind interfaces in `backend/repositories`, external integrations behind interfaces in `backend/clients`, and thin inbound handlers in `backend/controllers`. Server-side data fetching for React Server Components lives in `backend/loaders`. The frontend is organized by feature (`frontend/ui`, `frontend/state`, `frontend/api`) with shared utilities, transport layers, and a structured logger per side (`backend/shared/logger`, `frontend/shared/logger`). All DI wiring is centralized in `backend/config` factory functions.

---

## Architecture & Directory Structure

The codebase is split into four concerns: **routes** (`app/`), **backend** (ports & adapters), **frontend** (UI & client state), and **shared contracts**. Tests live alongside their source.

```
royaraqamia/
├── app/                          # Next.js App Router — pages, layouts, route handlers
│   ├── [code]/                   #   LinkSnap short-code redirect handler
│   ├── admin/certificates/       #   Certificate CRUD (admin only)
│   ├── api/version/              #   Version probe endpoint
│   ├── app-info/                 #   Application information page
│   ├── auth/                     #   Login, signup, OTP, password reset/update
│   ├── blog/                     #   Public blog (list + [slug] article)
│   ├── blogpress/                #   Blog editor product (app + editor/[id])
│   ├── habitflow/                #   Habit tracker product (+ api/)
│   ├── linksnap/                 #   URL shortener product (+ api/, landing)
│   ├── spendtrack/               #   Expense tracker product (+ categories/)
│   ├── verify/                   #   Public certificate verification
│   ├── terms/ · privacy/ · offline/
│   ├── layout.tsx · page.tsx     #   Root marketing layout & home page
│   └── global.css                #   Tailwind entry point
│
├── backend/                      # Clean architecture — business logic + infrastructure
│   ├── clients/                  #   Outbound adapters (Resend email, Cloudflare Turnstile, Upstash)
│   ├── config/                   #   Composition roots / DI wiring — factory functions that bind
│   │                             #   concretes to interfaces (auth.ts, linksnap.ts, habitflow.ts, …)
│   ├── controllers/              #   Thin inbound handlers — parse request → call ONE service → shape
│   │                             #   response (auth, certificates, spendtrack, linksnap)
│   ├── loaders/                  #   Server-side data loaders for React Server Components
│   ├── middleware/               #   Session middleware, auth guards, rate-limit helpers
│   ├── models/                   #   Data shapes (Supabase auto-generated database types)
│   ├── repositories/             #   Data access — the only code that knows the DB, behind interfaces
│   ├── services/                 #   Pure business logic (auth, blogpress, certificates, habitflow,
│   │                             #   linksnap, notifications, spendtrack)
│   ├── shared/                   #   Leaf utilities — logger, admin-validator, rate limiters, error classes
│   └── transport/                #   Network mechanics — HTTP helpers, cookies, cache revalidation
│
├── frontend/                     # Client-side code, organized by layer
│   ├── api/                      #   Domain-meaningful API calls (auth, blogpress, spendtrack, …)
│   ├── state/                    #   React hooks & contexts (session, notifications, product state)
│   ├── transport/                #   Network mechanics — HTTP client (request<T>), Supabase browser client
│   ├── shared/                   #   Leaf utilities — logger, constants, fonts, formatting, metadata (no app imports)
│   └── ui/                       #   Components / views / screens — presentation only
│       ├── primitives/           #     Low-level UI primitives (shadcn/ui: button, dialog, input, …)
│       ├── shared/               #     Cross-cutting UI (error boundary, navbar, page-header)
│       ├── app-shell/            #     App layout shell
│       └── <product>/            #     Product-specific components (blogpress, habitflow, linksnap, …)
│
├── shared/                       # The API contract — request/response types both sides import
│   └── contracts/                #   Zod schemas + TS types per domain (auth, blog, certificates, …)
│
├── supabase/
│   └── migrations/               #   Versioned SQL migrations (schema, RLS, storage buckets)
│
├── e2e/                          # Playwright end-to-end tests (+ responsive variants)
│   └── setup-test-user.ts        #   Bootstraps a test account via Supabase Admin API
│
├── scripts/
│   ├── generate-icons.mjs    #   Icon/PWA asset generation
│   ├── compute-version.mjs   #   Bakes release version into the server bundle
│   └── release-tools.mjs     #   Release bump/tag/changelog logic
│
├── data/                         # Static content (e.g. testimonials)
├── public/                       # Static assets, PWA files
├── .github/
│   ├── actions/setup-environment #   Composite Node/CI setup action
│   └── workflows/code-quality.yml#   Lint, format, type-check, test, build pipeline
│   └── workflows/release.yml     #   Auto bump/tag/changelog on main
│
├── package.json                  # Scripts, dependencies, engines
├── next.config.js                # Security headers, CSP, Sentry & bundle-analyzer wiring
├── vercel.json                   # Edge cache-control headers for /, static, and service worker
├── vitest.config.ts              # Unit/integration test runner config
├── playwright.config.ts          # E2E config (5 device projects, auto web server)
├── example.env                   # Environment template (safe to commit)
└── tsconfig.json                 # Strict TypeScript configuration
```

> **Separation of concerns:** The dependency rule flows inward: `controller → service → repository / client`. Controllers never contain business logic; services depend on interfaces, never on HTTP or SQL directly; repositories are the only code that knows the database. All DI wiring is centralized in `backend/config/` factory functions. `shared/contracts` keeps request/response shapes typed and identical on both sides of the network boundary. `backend/shared/logger` and `frontend/shared/logger` are the single logging boundary per deployment side — no `console.error` or `console.warn` calls exist outside the logger itself.

---

## Prerequisites & Tech Stack

### Runtimes & Tooling

| Tool             | Required                      | Notes                                                                                        |
| ---------------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| **Node.js**      | `>= 20.9` (declared: `>= 18`) | Node 22 LTS is the CI-verified version (`.github/actions/setup-environment`)                 |
| **npm**          | `>= 10`                       | npm 9+ works; `npm ci` is used in CI                                                         |
| **Git**          | any recent version            | For cloning & version control                                                                |
| **Supabase CLI** | `>= 2.x` (install globally)   | Needed for migrations — **not** a project devDependency; `npm i -g supabase` (or see step 4) |

### Languages

- **TypeScript `7.x`** — strict mode (`strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals/Parameters`)
- **Next.js 16 (App Router)** with **React 19** and server components
- **Tailwind CSS 4** + `@tailwindcss/postcss` + `tw-animate-css`
- **CSS** — custom properties / design tokens, RTL-first styling

### Runtime Services (all external)

| Service                  | Purpose                                                                  | Package / Config                         |
| ------------------------ | ------------------------------------------------------------------------ | ---------------------------------------- |
| **Supabase**             | PostgreSQL database, Auth (OTP + email), Storage (post images), Realtime | `@supabase/supabase-js`, `@supabase/ssr` |
| **Upstash Redis**        | Distributed rate limiting                                                | `@upstash/ratelimit`, `@upstash/redis`   |
| **Resend**               | Transactional & OTP emails                                               | `resend`                                 |
| **Sentry**               | Error monitoring & performance                                           | `@sentry/nextjs`                         |
| **Cloudflare Turnstile** | Bot protection on auth forms                                             | server-side `siteverify` call            |
| **Vercel**               | Hosting, edge caching, deployment                                        | `vercel.json`, `next.config.js`          |

### UI & Utilities

Radix UI primitives + shadcn/ui components · Motion (Framer Motion successor) · Lucide React · TipTap (BlogPress editor) · react-hook-form + Zod · Recharts (charts) · qrcode (certificate QR) · Sonner (toasts) · Vaul · embla-carousel.

---

## Getting Started

### 1. Clone the repository

```bash
git clone git@github.com:your-org/royaraqamia.git
cd royaraqamia
```

### 2. Install dependencies

```bash
npm ci
```

> `npm ci` is preferred for reproducible installs (locked via `package-lock.json`). The project ships a `.npmrc` with `legacy-peer-deps=true`. A `postinstall` hook patches the TypeScript install for the project's toolchain.

### 3. Configure environment variables

```bash
cp example.env .env.local
```

Then fill in every key described in the [Environment Variables](#environment-variables) table. **Do not commit `.env`** — it is git-ignored.

### 4. Run database migrations

Schema changes, Row-Level Security policies, and storage buckets are managed as **incremental** versioned SQL migrations in `supabase/migrations/`, applied with the Supabase CLI (`npm i -g supabase` if you haven't installed it globally).

> **Important — base schema lives on the remote project.** The first migration file, `20260718105449_unified_schema_all_projects.sql`, is intentionally a **stub** (see its header comment): the full base schema was created on the Supabase project and only lives there. `supabase db push` therefore applies **only the incremental migrations** that come after it — it will **not** recreate the database from scratch. To regenerate a full schema dump locally, run `supabase db dump --schema-only`.

```bash
# One-time login (only if you haven't linked the project)
supabase login

# Link this repo to your Supabase project
supabase link --project-ref <PROJECT_REF>

# Apply pending incremental migrations
supabase db push
```

Migrations are applied in filename order. New schema changes should always be added as a new numbered migration file, never by editing existing ones.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (RTL Arabic site by default).

> **Required env at dev time:** `next.config.js` fails the build if `NEXT_PUBLIC_WHATSAPP_PHONE` is unset. `Vitest` injects a test value automatically for unit tests.

### Common scripts

| Command                     | Description                                               |
| --------------------------- | --------------------------------------------------------- |
| `npm run dev`               | Start the Next.js dev server with HMR                     |
| `npm run build`             | Generate icons → `tsc --noEmit` → production `next build` |
| `npm start`                 | Run the production server (after `build`)                 |
| `npm run lint` / `lint:fix` | ESLint on the whole repo / auto-fix                       |
| `npm run format`            | Prettier write across the repo                            |
| `npm test`                  | Run all unit/integration tests once (Vitest)              |
| `npm run test:watch`        | Run tests in watch mode                                   |
| `npm run test:e2e`          | Run Playwright end-to-end tests                           |
| `npm run icons`             | Regenerate icon assets                                    |

---

## Environment Variables

Copy `example.env` to `.env.local` and set each value. All values below are **placeholders** — never commit real secrets.

| Variable                               | Description                                                            | Example / Placeholder                          | Required                 |
| -------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- | ------------------------ |
| `NEXT_PUBLIC_SITE_URL`                 | Public canonical origin of the site                                    | `https://royaraqamia.com`                      | ✅                       |
| `NEXT_PUBLIC_WHATSAPP_PHONE`           | WhatsApp number for contact CTAs                                       | `963000000000`                                 | ✅ (build-time enforced) |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL (client + server)                                 | `https://<project-ref>.supabase.co`            | ✅                       |
| `SUPABASE_URL`                         | Alias of the Supabase project URL                                      | `https://<project-ref>.supabase.co`            | ✅                       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public anon/publishable key (safe for the browser)                     | `sb_publishable_...`                           | ✅                       |
| `SUPABASE_SERVICE_ROLE_KEY`            | **Secret.** Server-only service-role key (admin operations, E2E setup) | `eyJhbGciOi...`                                | ✅                       |
| `RESEND_API_KEY`                       | Resend API key for transactional email                                 | `re_...`                                       | ✅                       |
| `RESEND_FROM_EMAIL`                    | Sender address for outgoing email                                      | `no-reply@royaraqamia.com`                     | ✅                       |
| `RESEND_FROM_NAME`                     | Sender display name                                                    | `رؤية رقمية`                                   | ✅                       |
| `NEXT_PUBLIC_SENTRY_DSN`               | Public Sentry DSN (client SDK)                                         | `https://...@o000000.ingest.sentry.io/0000000` | ✅                       |
| `SENTRY_DSN`                           | Server-side Sentry DSN                                                 | `https://...@o000000.ingest.sentry.io/0000000` | ✅                       |
| `SENTRY_ORG`                           | Sentry organization slug (build plugin)                                | `your-org-slug`                                | ✅ (for CI build)        |
| `SENTRY_PROJECT`                       | Sentry project slug (build plugin)                                     | `your-project-slug`                            | ✅ (for CI build)        |
| `SENTRY_AUTH_TOKEN`                    | **Secret.** Sentry auth token (build plugin, sourcemap upload)         | `sntrys_...`                                   | ✅ (for CI build)        |
| `ADMIN_EMAILS`                         | Comma-separated emails granted admin access                            | `admin@royaraqamia.com,ops@royaraqamia.com`    | ✅                       |
| `UPSTASH_REDIS_REST_URL`               | Upstash Redis REST endpoint (rate limiting)                            | `https://<db>.upstash.io`                      | ✅                       |
| `UPSTASH_REDIS_REST_TOKEN`             | **Secret.** Upstash Redis REST token                                   | `AVNS_...`                                     | ✅                       |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`       | Cloudflare Turnstile site key (client)                                 | `0x4AAAA...`                                   | ✅                       |
| `TURNSTILE_SECRET_KEY`                 | **Secret.** Cloudflare Turnstile secret (server verify)                | `0x4AAAA...`                                   | ✅                       |
| `E2E_TEST_EMAIL`                       | Email of the Playwright test account                                   | `e2e+ci@example.com`                           | for `test:e2e`           |
| `E2E_TEST_PASSWORD`                    | **Secret.** Password of the Playwright test account                    | `change-me`                                    | for `test:e2e`           |

> **Naming convention:** `NEXT_PUBLIC_*` variables are inlined into the client bundle and are therefore **not** secrets. Everything else must only be read server-side. The Supabase **service-role key** bypasses RLS — never expose it to the browser.

---

## Running the Test Suite

### Unit & integration tests (Vitest)

Tests are co-located as `**/*.test.{ts,tsx}` (e.g. `backend/services/__tests__/`, `frontend/ui/__tests__/`, `shared/contracts/__tests__/`). They run in a `jsdom` environment with globals enabled.

```bash
# Run all unit/integration tests once
npm test

# Run in watch mode while developing
npm run test:watch

# Run a single test file
npx vitest run backend/services/certificates/__tests__/certificate-verification.test.ts
```

### End-to-end tests (Playwright)

Playwright covers the main products plus a dedicated **responsive suite** executed across five device projects (mobile 320/375/428px, tablet, and desktop). The config auto-starts `npm run dev` on port 3000 and reuses the running server if one exists.

```bash
# Full E2E run (all projects)
npm run test:e2e

# A single spec file
npx playwright test e2e/linksnap-responsive.spec.ts

# Only the responsive projects (mobile/tablet viewports)
npx playwright test --grep responsive

# Interactive UI mode
npx playwright test --ui
```

Before running E2E tests, ensure `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` are set in `.env.local` — `e2e/setup-test-user.ts` creates (or refreshes) the test account via the Supabase Admin API. The HTML report is written to `playwright-report/` and traces are captured on first retry.

### CI

`.github/workflows/code-quality.yml` runs on every push/PR to `main`/`master`: **Prettier check → ESLint → `tsc --noEmit` → `npm test` → `npm run build`** on Node 22.

---

## Deployment

The production build is compiled by Next.js and deployed to **Vercel**.

### Build

```bash
# Production build (icons → type-check → next build)
npm run build
```

This produces the optimized production bundle in `.next/` ready for `next start` or a serverless platform.

### Deploy to Vercel

1. **Connect the repository** in the Vercel dashboard and set the Framework preset to **Next.js**.
2. **Add every environment variable** from the [Environment Variables](#environment-variables) table in the Vercel project settings (Production/Preview/Development as appropriate).
3. **Deploy** — every push to the production branch triggers an automatic build; preview deployments are created for pull requests.

### Platform configuration

- `next.config.js` — enforces a strict **Content-Security-Policy**, security headers (HSTS, X-Frame-Options, Permissions-Policy, etc.), remote-image allowlists, and wires the **Sentry** webpack plugin (enabled only on Vercel/CI, with sourcemaps tunnelled through `/monitoring`).
- `vercel.json` — sets `no-cache` on routes and the service worker (`/sw.js`) and immutable caching for `/_next/static/*`.
- `.github/workflows/code-quality.yml` — gates merges with lint, type-check, tests, and a production build.

### Post-deploy

- Verify the live site at the production URL and the version probe at `/api/version`.
- Monitor errors and performance in the Sentry dashboard (DSN-based, `monitoring` tunnel).
- Run migrations via `supabase db push` **before** deploying code that depends on new columns.

---

## Versioning

Every merge/commit to `main` produces a unique, monotonic release version in the format `<X.Y.Z>+build.<N>.<7-char-sha>` (SemVer 2.0 core + build metadata). The build metadata is ignored for SemVer precedence but gives every commit a reproducible identifier.

- **`X.Y.Z`** — the **displayed** release number. Source of truth is the committed `package.json#version`, kept equal to the current tag by the release workflow (an `APP_VERSION` env override pins a manual deploy).
- **`N`** — commits since the last `vX.Y.Z` tag.
- **`<sha>`** — 7-char commit hash (from `VERCEL_GIT_COMMIT_SHA` on Vercel, `git rev-parse --short HEAD` locally, `unknown` as last resort).

### Release pipeline

Pushing to `main` runs the Code Quality gate; on success the `Release` workflow (`workflow_run`-gated to `event == push && head_branch == main`):

1. Verifies `npm run build` passes **before** minting a release (a broken tree never releases).
2. Reads the latest `vX.Y.Z` tag and bumps from the merged conventional commit:
   - breaking / `!` → **major** (`X+1.0.0`)
   - `feat` → **minor** (`X.Y+1.0`)
   - anything else → **patch** (`X.Y.Z+1`)
3. Bumps `package.json#version`, writes `CHANGELOG.md` (Keep-a-Changelog), commits `chore(release): vX.Y.Z [skip ci]`, tags, and creates a GitHub Release with notes from the changelog section.

Vercel's Git integration auto-deploys the `[skip ci]` release commit (GitHub Actions skip it; Vercel does not). The double deploy this creates is intentional — the release commit is the canonical deployed artifact.

### Where the version is shown

- `GET /api/version` returns `version` (the unchanged deployment fingerprint), plus `releaseVersion`, `commit`, `ref`, `env`, and `releasedAt`.
- `frontend/ui/UpdatePopup.tsx` shows the release number when an update is detected: «تحديث متاح — النسخة الجديدة 1.4.1».
- Sentry releases are tagged with `releaseVersion` (server, edge, and client).

### Commands

```bash
# Rehearse the next release locally without committing/tagging/pushing
npm run version:next

# Manually run a release dry-run in CI
node scripts/release-tools.mjs --next --dry-run

# Inspect the baked version module (regenerated by prebuild/predev)
cat backend/config/generated/app-version.ts
```

---

## License

All rights reserved. This codebase is **PRIVATE and CONFIDENTIAL** — see [SECURITY.md](SECURITY.md) for the vulnerability reporting process.

**Contact:** contact@royaraqamia.com
