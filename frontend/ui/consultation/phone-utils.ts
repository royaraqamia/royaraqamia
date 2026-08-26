import { COUNTRY_DIAL_CODES, type CountryDialCode } from './country-dial-codes';

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const MAX_NATIONAL_LENGTH = 18;

/** Pure helpers for composing/parsing WhatsApp numbers stored as "+<dial> <national>". */

function toLatinDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)));
}

/**
 * Live-typing sanitizer for the national-number field: Arabic-Indic digits
 * become Latin, everything but digits/spaces/dashes is dropped.
 * Deliberately keeps leading zeros so the caret stays predictable while typing.
 */
export function sanitizeTypedNational(raw: string): string {
  return toLatinDigits(raw)
    .replace(/[^0-9\s-]/g, '')
    .trimStart()
    .slice(0, MAX_NATIONAL_LENGTH);
}

/** Composes the stored value; strips one trunk-prefix "0" (E.164 has none). */
export function composePhoneNumber(dial: string, national: string): string {
  const normalized = sanitizeTypedNational(national).replace(/^0/, '');
  return normalized ? `+${dial} ${normalized}` : `+${dial}`;
}

/**
 * Normalizes pasted content into a national part: if the paste starts with
 * "+" it is treated as international and the matched dial code (longest
 * match wins) is removed; otherwise only sanitization applies.
 */
export function toNationalFromPaste(raw: string, countries?: readonly CountryDialCode[]): string {
  const latin = toLatinDigits(raw).trim();
  const list = countries ?? COUNTRY_DIAL_CODES;
  if (!latin.startsWith('+')) {
    return sanitizeTypedNational(latin).replace(/^0/, '');
  }
  const digits = latin.slice(1);
  const match = findDialMatch(digits, list);
  const rest = match ? digits.slice(match.dial.length) : digits;
  return sanitizeTypedNational(rest).replace(/^[\s-]*0/, '');
}

function findDialMatch(
  digits: string,
  countries: readonly CountryDialCode[]
): CountryDialCode | null {
  let best: CountryDialCode | null = null;
  for (const country of countries) {
    if (!digits.startsWith(country.dial)) continue;
    if (!best || country.dial.length > best.dial.length) best = country;
  }
  return best;
}

export interface StoredPhoneParts {
  country: CountryDialCode | null;
  national: string;
}

/** Splits a stored value into its country + national part; null country when unknown/empty. */
export function splitStoredPhone(
  value: string,
  countries?: readonly CountryDialCode[]
): StoredPhoneParts {
  const list = countries ?? COUNTRY_DIAL_CODES;
  const trimmed = value.trim();
  if (!trimmed) return { country: null, national: '' };
  const digits = toLatinDigits(trimmed).replace(/^\+/, '');
  const match = findDialMatch(digits, list);
  if (!match) return { country: null, national: sanitizeTypedNational(trimmed) };
  const rest = digits.slice(match.dial.length);
  const national = sanitizeTypedNational(rest).replace(/^[\s-]*0(?=\d)/, '');
  return { country: match, national };
}
