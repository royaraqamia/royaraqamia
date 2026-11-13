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
 *
 * It is minted by the counted action that needs it, not by the middleware.
 * A document that carries `Set-Cookie` is not cacheable at the edge — this
 * cookie used to be stamped on every navigation, which is why Cloudflare could
 * store no HTML at all (ADR-0176). No page reads this id; only `POST` routes do.
 */
export const VISITOR_COOKIE_NAME = 'rar_visitor';

const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const VISITOR_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The visitor id this request carries, or null when it has none yet. */
export function readVisitorKey(request: NextRequest): string | null {
  const value = request.cookies?.get?.(VISITOR_COOKIE_NAME)?.value;
  if (!value) return null;
  // The id is a UUID we minted; anything else is a hand-written cookie and is
  // treated as absent rather than trusted as a subject.
  return VISITOR_KEY_PATTERN.test(value) ? value : null;
}

/**
 * The visitor id this request is counted as: the one it carries, or a fresh one
 * for an action that arrives without a cookie. The caller counts with `key` and
 * stamps it with `stampVisitorCookie` when `minted` is true, so the first action
 * already has the identity every later one will present.
 */
export function visitorKeyFor(request: NextRequest): { key: string; minted: boolean } {
  const carried = readVisitorKey(request);
  if (carried) return { key: carried, minted: false };
  return { key: crypto.randomUUID(), minted: true };
}

/**
 * Write a freshly minted id onto the response of the action that asked for it.
 *
 * Only ever call this on a response that is not cacheable — the counted-action
 * routes, which answer a `POST`. On a document it would make the page
 * uncacheable again, which is the whole reason this is not middleware work.
 */
export function stampVisitorCookie(response: NextResponse, key: string): NextResponse {
  response.cookies.set(VISITOR_COOKIE_NAME, key, {
    path: '/',
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}
