/**
 * Name of the cookie that carries the visitor's ISO 3166-1 alpha-2 country.
 * Set by `proxy.ts` from the platform geo header so the client can resolve a
 * location-based default without a network round-trip.
 */
export const COUNTRY_COOKIE_NAME = 'rr-country';

/** A strict ISO 3166-1 alpha-2 shape check. */
export const COUNTRY_ISO_PATTERN = /^[A-Za-z]{2}$/;

/** Reads the country code from a `document.cookie`-style string, or null. */
export function readCountryCookie(cookieString: string): string | null {
  const match = new RegExp(`(?:^|;\\s*)${COUNTRY_COOKIE_NAME}=([A-Za-z]{2})(?:;|$)`).exec(
    cookieString
  );
  return match?.[1] ?? null;
}
