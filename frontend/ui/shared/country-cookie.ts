import { COUNTRY_ISO_PATTERN } from '@/shared/contracts/geo';

/**
 * Name of the cookie that may carry the visitor's ISO 3166-1 alpha-2 country.
 *
 * Nothing sets it any more — the platform's header reaches the form as a server
 * prop (`frontend/ui/shared/geo-country.tsx`), because a document that sets a
 * cookie cannot be cached (ADR-0176). It is still read, so a value a person or a
 * test writes by hand remains an override rather than being ignored.
 */
export const COUNTRY_COOKIE_NAME = 'rr-country';

export { COUNTRY_ISO_PATTERN };

/** Reads the country code from a `document.cookie`-style string, or null. */
export function readCountryCookie(cookieString: string): string | null {
  const match = new RegExp(`(?:^|;\\s*)${COUNTRY_COOKIE_NAME}=([A-Za-z]{2})(?:;|$)`).exec(
    cookieString
  );
  return match?.[1] ?? null;
}
