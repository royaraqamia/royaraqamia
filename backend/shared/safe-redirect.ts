/**
 * The one redirect-safety rule, including the repeated-decoding defence. The
 * middleware, the auth links and the route guards all call this; the boolean
 * form below is derived from it so a hardening fix applies everywhere.
 */
export function safeRedirect(to: string | null | undefined, fallback: string = '/'): string {
  if (!to) return fallback;
  try {
    // Decode repeatedly to neutralize double/triple encoding
    let decoded = to;
    let prev: string;
    do {
      prev = decoded;
      decoded = decodeURIComponent(decoded);
    } while (decoded !== prev);

    if (!decoded.startsWith('/')) return fallback;
    if (decoded.startsWith('//') || decoded.startsWith('\\\\')) return fallback;
    if (/^(javascript|data|vbscript):/i.test(decoded)) return fallback;
    return decoded;
  } catch {
    return fallback;
  }
}

/** Boolean form of the one rule: is it safe to redirect to `to`? */
export function isSafeRedirect(to: string | null | undefined): boolean {
  if (!to) return false;
  const fallback = '\u0000unsafe';
  return safeRedirect(to, fallback) !== fallback;
}
