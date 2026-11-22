# Architecture & Layering

## Monorepo layout

- `app/` — Next.js App Router: pages, layouts, route handlers (product routes under `app/<product>/`).
- `backend/` — Clean/hexagonal architecture (ports & adapters).
- `frontend/` — Client-side by layer: `api/`, `state/`, `transport/`, `shared/`, `ui/`.
- `shared/contracts/` — API contract: Zod schemas + TS types imported by both sides.
- `supabase/migrations/` — versioned SQL migrations (schema, RLS, storage).
- `e2e/` — Playwright tests.
- `data/`, `public/`, `scripts/` — static content / assets / tooling.

## Layering (critical)

Flow: `controller → service → repository/client`

- **Controllers** are thin: parse → call ONE service → shape response. No business logic. The controller boundary is enforced by `layers/no-cross-layer-import` (`eslint-rules/layering.mjs`).
- **Services** depend on interfaces, never HTTP/SQL directly.
- **Repositories** are the only code that knows the DB.
- All DI wiring centralized in `backend/config/` factory functions.
- Server-side data loaders for RSC in `backend/loaders`.

## SDK isolation

Supabase `.from()` / external calls stay in `backend/repositories` / `backend/clients` (behind interfaces) and `frontend/transport` — never in UI components.

## Edge middleware — `proxy.ts`, not `middleware.ts`

Next.js 16 renamed the edge middleware file `middleware.ts` → `proxy.ts` (the exported function is `proxy`). **This repo has no `middleware.ts`** — the edge entry point is `proxy.ts` at the repo root. It calls `updateSession` (`backend/middleware/session.ts`) to refresh the Supabase session, then stamps the geo-derived country cookie. `config.matcher` excludes static assets.

## Feature folders

Product code follows this structure:

- `app/<product>/` — routes/pages
- `app/<product>/_components/` — components private to that route, and nothing else may import them
- `frontend/ui/<product>/` — UI components; anything a second caller draws
- `backend/services/<product>/` — business logic
- `backend/repositories/<product>/` — data access

`layers/no-cross-layer-import` refuses a `frontend/**` import of `app/**/_components/**`
([ADR-0196](adr/0196-a-ui-component-is-not-a-routes-private-file.md)).

## Shared contracts

Request/response shapes defined in `shared/contracts` (Zod), not duplicated.
