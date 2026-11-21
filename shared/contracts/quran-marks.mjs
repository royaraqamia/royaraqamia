/**
 * The three code points KFGQPC Uthmani Hafs v0.18 draws as its ayah-number
 * rosette (ADR 0067). They are the whole seam between the two reader faces:
 * `kfgqpcHafs` excludes them and `amiriQuranMarks` claims only them.
 *
 * One exported source, so the two `unicode-range` declarations cannot drift
 * and the font build can subset the marks file to exactly what its declaration
 * names. Plain `.mjs` on purpose: `scripts/subset-fonts.mjs` runs under Node
 * with no build step, while `frontend/ui/quran/font.ts` is compiled by Next.
 * This is the one file both can load, the seam `agent-behaviour.mjs` uses.
 */

/** The silent-letter marks, in the order the two faces' ranges name them. */
export const QURAN_MARK_CODEPOINTS = Object.freeze([0x06df, 0x06e3, 0x06eb]);

/** `U+XXXX` for one code point, with the four-digit padding CSS expects. */
function hex4(value) {
  return value.toString(16).toUpperCase().padStart(4, '0');
}

/** One inclusive range, collapsed to a single point when it has no width. */
function inclusiveRange(start, end) {
  return start === end ? `U+${hex4(start)}` : `U+${hex4(start)}-${hex4(end)}`;
}

/**
 * The inclusive `unicode-range` value for exactly these code points.
 *
 * @param {readonly number[]} points
 */
export function unicodeRangeFor(points) {
  return points.map((point) => inclusiveRange(point, point)).join(', ');
}

/**
 * The inclusive `unicode-range` value for everything except these code points.
 * The complement is what the Uthmani face declares, so no code point is claimed
 * by both faces or by neither.
 *
 * @param {readonly number[]} points
 * @param {number} min
 * @param {number} max
 */
export function unicodeRangeExcluding(points, min = 0, max = 0x10ffff) {
  const sorted = [...points].sort((a, b) => a - b);
  const ranges = [];
  let start = min;
  for (const point of sorted) {
    if (point < start) continue;
    if (point > start) ranges.push(inclusiveRange(start, point - 1));
    start = point + 1;
  }
  if (start <= max) ranges.push(inclusiveRange(start, max));
  return ranges.join(', ');
}

/** The marks face's declaration: exactly the three code points. */
export const QURAN_MARKS_UNICODE_RANGE = unicodeRangeFor(QURAN_MARK_CODEPOINTS);

/** The Uthmani face's declaration: everything but the three code points. */
export const QURAN_NON_MARKS_UNICODE_RANGE = unicodeRangeExcluding(QURAN_MARK_CODEPOINTS);
