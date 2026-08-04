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
