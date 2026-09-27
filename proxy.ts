import { NextResponse, type NextRequest } from 'next/server';

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

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  return withCountryCookie(request, response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
