/**
 * The searchable copy of the Quran's text (ADR-0057, P4).
 *
 * The stored text is verbatim by licence — "CHANGING IT IS NOT ALLOWED" — so
 * nothing here rewrites it. What is shared is one function that folds a *query*
 * and a *comparison copy* the same way, so the two cannot drift: the reader
 * normalizes each Ayah once, in the browser, from the same asset the text came
 * from, and nothing on disk is pre-folded.
 *
 * The asset carries the verbatim text rather than a normalized corpus, for one
 * reason: a hit has to be shown in the Ayah's own writing, with the match marked.
 * A normalized corpus would display «سموت» where the Mushaf has «سَمَٰوَٰتٍ», and
 * no amount of marking makes that the Quran.
 *
 * The rules, and why each one is not decoration:
 *
 * - **Marks come off.** Tashkeel, the Quranic annotation marks (waqf signs, small
 *   high letters) and tatweel are not letters a reader types. Stripping them is
 *   what lets «الرحمن» find «ٱلرَّحْمَٰن».
 * - **The superscript alef becomes a plain one.** Uthmani writes «سَمَٰوَٰتٍ»
 *   with U+0670 rather than an alef, so deleting it would make the most ordinary
 *   query in the text («سبع سماوات») match nothing. It is an alef; it is read as
 *   one; it is folded to one.
 * - **The hamza forms fold together.** أ إ آ ٱ → ا, ؤ → و, ئ → ي, ى → ي, ة → ه.
 *   A reader typing from memory cannot be asked which of the four alefs the
 *   Mushaf printed.
 * - **Substring, not word.** Arabic glues its particles on («والسماء»,
 *   «بالكتاب»), so a word-boundary match would miss the word the reader typed.
 *   This is why there is no tokenizer here and no index of words is built.
 * - **Whitespace collapses.** A query of two words has to match across whatever
 *   the line's justification did to the spacing.
 * - **A second, looser pass when the first finds nothing.** The Uthmani spelling
 *   writes some long vowels with a different letter from the one a reader types:
 *   «ٱلصَّلَوٰة» is الصلاة, «ٱلزَّكَوٰة» is الزكاة, «ٱلرَّحْمَٰن» is الرحمن. No rule
 *   about marks or hamza reaches those, so an exact pass over the text answers
 *   الصلاة with nothing. The fallback drops the long vowels (ا و ي) from both
 *   sides and scans again — the standard Arabic-search skeleton. It runs only
 *   when the exact pass returned no hit, so precision is never traded away for a
 *   query the text can answer as typed.
 */

/** The asset path, relative to the site root. Served from `public/`. */
export const QURAN_SEARCH_PATH = '/quran/search/index.json';

/**
 * The shortest query that searches the text. One letter matches thousands of
 * Ayat and the cap would make the answer look arbitrary; two is the first length
 * where a result reads as a result.
 */
export const QURAN_SEARCH_MIN_QUERY = 2;

/** How many Ayah hits the index shows before "show more". */
export const QURAN_SEARCH_PAGE_SIZE = 20;

/**
 * The index as the build writes it. One array, in reading order, of the Ayat
 * exactly as `public/quran/surah/**` stores them.
 *
 * `notice` is not decoration either: Tanzil's terms require the copyright block in
 * every file derived from the text, so `public/quran/meta/NOTICE.txt` travels with
 * this asset (see the build script's header).
 */
export interface QuranSearchAsset {
  schema: number;
  source: string;
  licence: string;
  /** The repo-relative path of the verbatim Tanzil notice this asset carries. */
  notice: string;
  /** The normalizer version whose rules this asset was built against. */
  normalizer: number;
  ayahs: string[];
}

/** What the search surface needs to fetch the index at all. */
export interface QuranSearchRef {
  /** `QURAN_SEARCH_PATH` */
  path: string;
  /** The asset's sha256 prefix: a re-vendor is a new key in every cache. */
  version: string;
  bytes: number;
  ayahs: number;
}

/** `normalizeArabic`'s output changes whenever its rules do; the asset records it. */
export const QURAN_NORMALIZER_VERSION = 1;

/**
 * Combining marks and decoration: every combining mark (tashkeel, the Quranic
 * annotation marks, the small high letters, the Extended-A marks), plus tatweel
 * and a BOM. Expressed as a Unicode property so a mark the Uthmani text uses and
 * this list forgot is still stripped — the failure mode of a hand-listed class is
 * a letter that silently stops matching.
 *
 * U+0670 (superscript alef) is a mark by category but an alef by reading, so it is
 * folded before this ever runs; see `SUPERSCRIPT_ALEF`.
 */
const MARKS = /[\p{M}\u0640\uFEFF]/gu;

/** One character, same classes — a non-global test, so no `lastIndex` state. */
const MARK = /[\p{M}\u0640\uFEFF]/u;

/** The superscript alef: a combining mark that is written and read as an alef. */
const SUPERSCRIPT_ALEF = '\u0670';

/**
 * The folded letters. `ٱ` (alef wasla) is the Uthmani form of a plain alef, which
 * is why it folds with أ إ آ rather than staying a class of its own.
 */
const FOLDS: Readonly<Record<string, string>> = {
  '\u0622': '\u0627', // آ
  '\u0623': '\u0627', // أ
  '\u0625': '\u0627', // إ
  '\u0671': '\u0627', // ٱ
  '\u0670': '\u0627', // ٰ superscript alef
  '\u0649': '\u064A', // ى
  '\u0626': '\u064A', // ئ
  '\u0624': '\u0648', // ؤ
  '\u0629': '\u0647', // ة
};

/**
 * One string, folded for comparison. Used for the query and for each Ayah's
 * comparison copy — never for anything the reader is shown.
 */
export function normalizeArabic(value: string): string {
  // The superscript alef first: it is a mark, and stripping marks would drop a
  // letter that is read as one.
  let text = value.split(SUPERSCRIPT_ALEF).join('\u0627').replace(MARKS, '');
  for (const [from, to] of Object.entries(FOLDS)) text = text.split(from).join(to);
  return text.replace(/\s+/g, ' ').trim();
}

/** The long vowels the loose pass drops, so spelling variants meet. */
const LONG_VOWELS = /[\u0627\u0648\u064A]/g;
/** One character, same class — a non-global test, so no `lastIndex` state. */
const LONG_VOWEL = /[\u0627\u0648\u064A]/;

/**
 * The second pass's form: `normalizeArabic` with the long vowels removed. Both
 * sides of a comparison use it, so a query typed in modern spelling meets the
 * Uthmani one — «الصلاة» and «الصلوة» both reduce to «الصله».
 */
export function normalizeLoose(value: string): string {
  return normalizeArabic(value).replace(LONG_VOWELS, '');
}

/**
 * The same folding, plus the map from each folded character back to the index it
 * came from in the original. That map is what lets a hit be marked inside the
 * Ayah's own text without splitting a letter from its marks.
 */
export function normalizeWithMap(value: string, loose = false): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] as string;
    if (character !== SUPERSCRIPT_ALEF && MARK.test(character)) continue;

    // A run of whitespace becomes one space, pointing at the run's first
    // character: a match that starts after it still lands on real text.
    if (/\s/.test(character)) {
      if (text.length > 0 && text.at(-1) !== ' ') {
        text += ' ';
        map.push(index);
      }
      continue;
    }

    const folded = FOLDS[character] ?? character;
    if (loose && LONG_VOWEL.test(folded)) continue;
    text += folded;
    map.push(index);
  }

  return { text, map };
}

/** Where a match sits inside the original Ayah, expanded to whole words. */
export interface QuranSearchMatch {
  before: string;
  match: string;
  after: string;
}

/**
 * Marks `needle` (already folded) inside `original`, or null when it is not there.
 *
 * The range is widened to the words it touches: slicing exactly at the matched
 * letters would cut a letter from the marks that follow it, and a fatha stranded
 * at the start of the next span renders on the wrong letter.
 */
export function markQuranMatch(
  original: string,
  needle: string,
  loose = false
): QuranSearchMatch | null {
  if (needle.length === 0) return null;

  const { text, map } = normalizeWithMap(original, loose);
  const start = text.indexOf(needle);
  if (start === -1) return null;

  const end = start + needle.length - 1;
  let from = map[start] ?? 0;
  let to = (map[end] ?? original.length - 1) + 1;

  while (from > 0 && !/\s/.test(original[from - 1] as string)) from -= 1;
  while (to < original.length && !/\s/.test(original[to] as string)) to += 1;

  return {
    before: original.slice(0, from),
    match: original.slice(from, to),
    after: original.slice(to),
  };
}

/**
 * Which sura and Ayah the `position`-th Ayah of the whole text is.
 *
 * The corpus is one array in reading order, so this is the only place the two
 * coordinate systems meet. `counts[i]` is sura `i + 1`'s Ayah count.
 */
export function surahAyahOf(
  position: number,
  counts: readonly number[]
): { surah: number; ayah: number } | null {
  if (!Number.isInteger(position) || position < 0) return null;

  let remaining = position;
  for (const [index, count] of counts.entries()) {
    if (remaining < count) return { surah: index + 1, ayah: remaining + 1 };
    remaining -= count;
  }
  return null;
}

/**
 * Every position whose folded text contains the folded query, in reading order, up
 * to `limit`. A plain substring scan over an already-folded corpus: 6,236 short
 * strings is sub-millisecond, which is why there is no worker and no search engine
 * behind this.
 */
export function findAyahPositions(
  exactCorpus: readonly string[],
  looseCorpus: readonly string[],
  query: string,
  limit: number
): { positions: number[]; loose: boolean } {
  const exact = normalizeArabic(query);
  if (exact.length < QURAN_SEARCH_MIN_QUERY) return { positions: [], loose: false };

  const hits = scan(exactCorpus, exact, limit);
  if (hits.length > 0) return { positions: hits, loose: false };

  // The second pass answers a spelling the Uthmani text writes differently; its
  // form is only worth computing once the exact one has failed.
  const folded = normalizeLoose(query);
  if (folded.length < QURAN_SEARCH_MIN_QUERY) return { positions: [], loose: false };
  return { positions: scan(looseCorpus, folded, limit), loose: true };
}

function scan(corpus: readonly string[], needle: string, limit: number): number[] {
  const hits: number[] = [];
  for (const [position, ayah] of corpus.entries()) {
    if (ayah.includes(needle)) {
      hits.push(position);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

/** `findAyahPositions` over the verbatim text: fold both ways, scan, answer both. */
export function findAyahs(
  corpus: readonly string[],
  query: string,
  limit: number
): { position: number; ayah: string; loose: boolean }[] {
  const { positions, loose } = findAyahPositions(
    corpus.map((ayah) => normalizeArabic(ayah)),
    corpus.map((ayah) => normalizeLoose(ayah)),
    query,
    limit
  );
  return positions.map((position) => ({
    position,
    ayah: corpus[position] as string,
    loose,
  }));
}
