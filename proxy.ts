import { NextResponse, type NextRequest } from 'next/server';

import { withAppUpdateGate } from '@/backend/middleware/app-update';
import { updateSession } from '@/backend/middleware/session';
import { COUNTRY_COOKIE_NAME, COUNTRY_ISO_PATTERN } from '@/frontend/ui/shared/country-cookie';

/**
 * Platform-provided geo headers, in priority order. Vercel populates
 * `x-vercel-ip-country`; Cloudflare populates `cf-ipcountry`.
 */
const GEO_HEADERS = ['x-vercel-ip-country', 'cf-ipcountry'] as const;

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Persists the visitor's IP-derived country in a cookie so the contact forms can
 * default their country picker to where the user actually is — without a network
 * round-trip and without turning the prerendered form pages dynamic. The cookie
 * is only written when geo data is available (absent in local development), in
 * which case the client falls back to timezone/language.
 */
function withCountryCookie(request: NextRequest, response: NextResponse): NextResponse {
  const geoCountry = GEO_HEADERS.map((header) => request.headers.get(header)).find(
    (value): value is string => value !== null && COUNTRY_ISO_PATTERN.test(value)
  );
  if (!geoCountry) return response;

  const iso = geoCountry.toUpperCase();
  const alreadyCurrent = request.cookies
    .getAll()
    .some((cookie) => cookie.name === COUNTRY_COOKIE_NAME && cookie.value === iso);
  if (alreadyCurrent) return response;

  response.cookies.set(COUNTRY_COOKIE_NAME, iso, {
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}

const COUNTRY_COOKIE_PATHS = ['/consultation', '/request-project', '/hire', '/training'] as const;

/**
 * The pages whose own components read the country cookie — the contact forms in
 * these flows (`CountryPhoneInput` → `useDefaultCountry`).
 *
 * Everywhere else the cookie buys nothing and costs the page its cacheability:
 * a response that sets a cookie is never stored at the edge, so stamping it on
 * every navigation is why Cloudflare could cache no HTML on this site at all
 * (ADR-0176). The rates surfaces fall back to timezone and language, which is
 * the fallback `useDefaultCountry` already implements.
 *
 * A route added here by mistake costs a cacheable page; a route left out loses
 * the IP-derived default until it is added, and nothing breaks.
 */
function wantsCountryCookie(pathname: string): boolean {
  return COUNTRY_COOKIE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest) {
  // Before the session: an app below the supported floor must not spend a
  // Supabase call on an answer the server will refuse anyway (#503).
  const updateRequired = withAppUpdateGate(request);
  if (updateRequired) return updateRequired;

  const response = await updateSession(request);
  return wantsCountryCookie(request.nextUrl.pathname)
    ? withCountryCookie(request, response)
    : response;
}

export const config = {
  // Middleware runs before the cache lookup, so every path matched here costs
  // one invocation. On Hobby the binding budgets are Function Invocations and
  // Fluid Active CPU, and most requests to this site are assets that need
  // neither an auth decision nor the country cookie. Excluding them is safe:
  // the middleware only ever acts on navigations and API calls (`/admin`,
  // `/account`, `/auth/*` carry no extension; the API layer authenticates
  // itself with `withAuthenticatedUser`).
  matcher: [
    '/((?!_next/static|_next/image|monitoring|favicon\\.ico|manifest\\.json|sw\\.js|sw-version\\.js|sw-push-config\\.js|sw-routing\\.js|design-system/|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|mjs|map|json|txt|xml|woff|woff2|ttf|otf|mp4|webmanifest)$).*)',
  ],
};
