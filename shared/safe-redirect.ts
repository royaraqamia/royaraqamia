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

    // Reject C0 control characters and DEL: the WHATWG URL parser strips
    // tab/LF/CR, so a decoded leading `/\t/` would collapse to `//`.
    for (let i = 0; i < decoded.length; i++) {
      const code = decoded.charCodeAt(i);
      if (code <= 0x1f || code === 0x7f) return fallback;
    }
    if (!decoded.startsWith('/')) return fallback;
    if (/^\/[/\\]/.test(decoded)) return fallback;
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
