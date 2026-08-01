export function safeRedirect(to: string | null | undefined, fallback: string = '/'): string {
  if (!to) return fallback;
  try {
    const decoded = decodeURIComponent(to);
    if (!decoded.startsWith('/')) return fallback;
    if (decoded.startsWith('//') || decoded.startsWith('\\\\')) return fallback;
    if (/^\/\//.test(to)) return fallback;
    if (/^(javascript|data|vbscript):/i.test(decoded)) return fallback;
    return decoded;
  } catch {
    return fallback;
  }
}
