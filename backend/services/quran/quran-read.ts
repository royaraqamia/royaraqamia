import { loadQuranIndex, loadSurah } from '@/backend/loaders/quran';
import { loadQuranSearchCorpus } from '@/backend/loaders/quran-search';
import { normalizeArabic, normalizeLoose } from '@/shared/contracts/quran-search';

/**
 * The Quran, read by a server-side caller (#1430, ADR-0205).
 *
 * Three reads and one search, each on the content the page already draws: the
 * memoized index (`backend/loaders/quran.ts`), one sura's file, and the search
 * asset `npm run check:quran-search` keeps current. Nothing here invents a
 * second copy of the text or a second index of it — the window a caller asks for
 * is bounded here because a sura can be 286 Ayat and a turn's answer has a
 * ceiling.
 */

/** How many Ayat one reading answers when the caller names no end. */
export const SURAH_VERSE_WINDOW = 20;

/** The longest search answer a caller may ask for. */
export const QURAN_SEARCH_MAX_HITS = 20;

export interface SurahCard {
  number: number;
  name: string;
  ayahCount: number;
  revelation: string;
}

export interface VerseLine {
  number: number;
  text: string;
}

export interface SurahReading {
  number: number;
  name: string;
  ayahCount: number;
  from: number;
  to: number;
  verses: VerseLine[];
  /** True when the sura holds Ayat past `to`. */
  truncated: boolean;
}

export interface VerseReading {
  surah: { number: number; name: string };
  ayahCount: number;
  number: number;
  text: string;
}

export interface QuranHit {
  surah: { number: number; name: string };
  number: number;
  text: string;
}

/** The 114 suras, in the order of the text. */
export async function listSurahs(): Promise<SurahCard[]> {
  const index = await loadQuranIndex();
  return index.surahs.map((surah) => ({
    number: surah.n,
    name: surah.name,
    ayahCount: surah.ayahCount,
    revelation: surah.revelation,
  }));
}

/** One sura, from `from` to `to` (1-based, inclusive), or null when it is not one. */
export async function readSurah(
  number: number,
  from?: number,
  to?: number
): Promise<SurahReading | null> {
  const index = await loadQuranIndex();
  const summary = index.surahs.find((surah) => surah.n === number);
  if (!summary) return null;

  const surah = await loadSurah(number);
  if (!surah) return null;

  const start = clamp(from ?? 1, 1, surah.ayahs.length);
  const end = clamp(to ?? start + SURAH_VERSE_WINDOW - 1, start, surah.ayahs.length);

  return {
    number: summary.n,
    name: summary.name,
    ayahCount: summary.ayahCount,
    from: start,
    to: end,
    verses: surah.ayahs.slice(start - 1, end).map((text, offset) => ({
      number: start + offset,
      text,
    })),
    truncated: end < surah.ayahs.length,
  };
}

/** One Ayah with the sura it belongs to, so a reference answers on its own. */
export async function readVerse(
  surahNumber: number,
  ayahNumber: number
): Promise<VerseReading | null> {
  const index = await loadQuranIndex();
  const summary = index.surahs.find((surah) => surah.n === surahNumber);
  if (!summary) return null;

  const surah = await loadSurah(surahNumber);
  const text = surah?.ayahs[ayahNumber - 1];
  if (!text) return null;

  return {
    surah: { number: summary.n, name: summary.name },
    ayahCount: summary.ayahCount,
    number: ayahNumber,
    text,
  };
}

/**
 * Text search over the asset the page searches.
 *
 * The query is folded with the same two functions the reader's box uses, and a
 * hit is either an exact normalised occurrence or the looser second pass — the
 * asset itself stays the verbatim text, so what the tool answers is what the
 * Mushaf writes.
 */
export async function searchQuran(
  query: string,
  limit: number
): Promise<{ total: number; hits: QuranHit[] }> {
  const [corpus, index] = await Promise.all([loadQuranSearchCorpus(), loadQuranIndex()]);

  const exact = normalizeArabic(query);
  const loose = normalizeLoose(query);
  if (exact.length === 0) return { total: 0, hits: [] };

  const positions: QuranHit[] = [];
  let total = 0;

  for (let flat = 0; flat < corpus.ayahs.length; flat += 1) {
    const matches =
      corpus.exact[flat]!.includes(exact) ||
      (loose.length > 0 && corpus.loose[flat]!.includes(loose));
    if (!matches) continue;

    total += 1;
    if (positions.length >= limit) continue;

    const located = locate(index.surahs, flat);
    if (!located) continue;

    positions.push({
      surah: { number: located.surah.n, name: located.surah.name },
      number: located.ayah,
      text: corpus.ayahs[flat]!,
    });
  }

  return { total, hits: positions };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The flat Ayah index -> the sura and the Ayah inside it. */
function locate(
  surahs: ReadonlyArray<{ n: number; name: string; ayahCount: number }>,
  flat: number
): { surah: { n: number; name: string }; ayah: number } | null {
  let offset = 0;
  for (const surah of surahs) {
    if (flat < offset + surah.ayahCount) {
      return { surah, ayah: flat - offset + 1 };
    }
    offset += surah.ayahCount;
  }
  return null;
}
