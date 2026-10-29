import type { NextRequest, NextResponse } from 'next/server';

/**
 * The visitor's first-party id.
 *
 * A counted action that a visitor may take (a download, a digest opened, a
 * scan) has to survive the browser: the salted IP hash alone changes with the
 * network, and a cookie alone is cleared in one click. Both are recorded, and
 * the allowance is the union of the two (ADR-0093).
 *
 * The value is opaque and random; it names no one and is never joined to an
 * account. A signed-in caller is counted by `user_id` and this is ignored.
 */
export const VISITOR_COOKIE_NAME = 'rar_visitor';

const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** The visitor id this request carries, or null when it has none yet. */
export function readVisitorKey(request: NextRequest): string | null {
  const value = request.cookies?.get?.(VISITOR_COOKIE_NAME)?.value;
  if (!value) return null;
  // The id is a UUID we minted; anything else is a hand-written cookie and is
  // treated as absent rather than trusted as a subject.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

/**
 * Stamp a new visitor id on the response when the request has none. Called from
 * the edge middleware, so the first request that could be counted already
 * carries the id the route handler reads.
 */
export function withVisitorCookie(request: NextRequest, response: NextResponse): NextResponse {
  if (readVisitorKey(request)) return response;

  response.cookies.set(VISITOR_COOKIE_NAME, crypto.randomUUID(), {
    path: '/',
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}
