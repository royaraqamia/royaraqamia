import type { NextRequest } from 'next/server';

import { withAppUpdateGate } from '@/backend/middleware/app-update';
import { updateSession } from '@/backend/middleware/session';

/**
 * Edge middleware: the app-update gate, then the session.
 *
 * It writes no cookies of its own. Everything a visitor needs per-request is
 * either the session (`updateSession` rotates that, and a signed-in request
 * bypasses the cache anyway) or a value the page passes down — the country is a
 * server prop now (`backend/transport/geo.ts`). A response that carries
 * `Set-Cookie` is never stored by a shared cache, so a cookie written here would
 * cost the document its cacheability (ADR-0176).
 */
export async function proxy(request: NextRequest) {
  // Before the session: an app below the supported floor must not spend a
  // Supabase call on an answer the server will refuse anyway (#503).
  const updateRequired = withAppUpdateGate(request);
  if (updateRequired) return updateRequired;

  return updateSession(request);
}

export const config = {
  // Middleware runs before the cache lookup, so every path matched here costs
  // one invocation. On Hobby the binding budgets are Function Invocations and
  // Fluid Active CPU, and most requests to this site are assets that need
  // neither an auth decision nor a document render. Excluding them is safe:
  // the middleware only ever acts on navigations and API calls (`/admin`,
  // `/account`, `/auth/*` carry no extension; the API layer authenticates
  // itself with `withAuthenticatedUser`).
  matcher: [
    '/((?!_next/static|_next/image|monitoring|favicon\\.ico|manifest\\.json|sw\\.js|sw-version\\.js|sw-push-config\\.js|sw-routing\\.js|design-system/|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|mjs|map|json|txt|xml|woff|woff2|ttf|otf|mp4|webmanifest)$).*)',
  ],
};
