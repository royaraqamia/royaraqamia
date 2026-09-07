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

- **Controllers** are thin: parse → call ONE service → shape response. No business logic.
- **Services** depend on interfaces, never HTTP/SQL directly.
- **Repositories** are the only code that knows the DB.
- All DI wiring centralized in `backend/config/` factory functions.
- Server-side data loaders for RSC in `backend/loaders`.

## SDK isolation

Supabase `.from()` / external calls stay in `backend/repositories` / `backend/clients` (behind interfaces) and `frontend/transport` — never in UI components.

## Feature folders

Product code follows this structure:

- `app/<product>/` — routes/pages
- `frontend/ui/<product>/` — UI components
- `backend/services/<product>/` — business logic
- `backend/repositories/<product>/` — data access

## Shared contracts

Request/response shapes defined in `shared/contracts` (Zod), not duplicated.
