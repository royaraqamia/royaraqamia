/**
 * The visitor's country as the platform reports it.
 *
 * Two hosts have supplied this under different names and both are kept: Cloudflare
 * populates `cf-ipcountry` on every proxied request, and Vercel populated
 * `x-vercel-ip-country` while the site lived there (ADR-0174 moved it).
 */
export const GEO_HEADERS = ['cf-ipcountry', 'x-vercel-ip-country'] as const;

/** A strict ISO 3166-1 alpha-2 shape check. */
export const COUNTRY_ISO_PATTERN = /^[A-Za-z]{2}$/;

/**
 * The first geo header that carries a plausible ISO country, upper-cased, or null.
 *
 * Takes a getter rather than a `Headers` so the same rule serves the server (a
 * request's headers) and a test (a map).
 */
export function isoFromGeoHeaders(get: (name: string) => string | null | undefined): string | null {
  for (const name of GEO_HEADERS) {
    const value = get(name);
    if (value && COUNTRY_ISO_PATTERN.test(value)) return value.toUpperCase();
  }
  return null;
}
