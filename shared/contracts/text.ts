/**
 * Shared text normalisation for contract inputs.
 *
 * Two rules live here: digits are ASCII, and an untouched optional field is
 * `null` rather than `''`.
 */

/** Arabic-Indic (U+0660-U+0669) and Extended Arabic-Indic (U+06F0-U+06F9). */
const ARABIC_INDIC_DIGITS = /[\u0660-\u0669]/g;
const EXTENDED_ARABIC_INDIC_DIGITS = /[\u06f0-\u06f9]/g;

/**
 * Rewrites Arabic-Indic numerals to their ASCII shape: U+0661 U+0662 U+0663
 * become `123`.
 *
 * The product displays and stores Western digits only. Source text is caught by
 * `npm run check:digits`; this helper is the runtime half, for content that
 * arrives from a keyboard, a paste, an MCP call, or a row written before the
 * rule existed.
 */
export function toLatinDigits(value: string): string {
  return value
    .replace(ARABIC_INDIC_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(EXTENDED_ARABIC_INDIC_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

/**
 * A form submits an untouched optional field as an empty string, so both the
 * schema boundary and the persistence boundary need one agreed answer to "is
 * this blank?". It is `null`: a missing value must never reach the database as
 * `''`, where it would be indistinguishable from a value the user cleared.
 */
export function toNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const normalized = toLatinDigits(trimmed);
  return normalized ? normalized : null;
}
