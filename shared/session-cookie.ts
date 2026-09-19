// @supabase/ssr names its auth session cookie `sb-<ref>-auth-token`, splitting
// oversized (base64url) values into `sb-<ref>-auth-token.0`, `.1`, etc.
const SESSION_COOKIE_NAME_RE = /^sb-[\w-]+-auth-token(?:\.\d+)?$/;

/**
 * The one session-cookie rule. The middleware, the server identity module and
 * the browser session provider all ask this question, so they cannot disagree
 * about whether a session exists.
 */
export function isSessionCookieName(name: string): boolean {
  return SESSION_COOKIE_NAME_RE.test(name);
}

/** True when any cookie is a Supabase session cookie. */
export function hasSessionCookie(cookies: ReadonlyArray<{ name: string }>): boolean {
  return cookies.some((cookie) => isSessionCookieName(cookie.name));
}
