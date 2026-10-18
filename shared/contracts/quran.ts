/**
 * The Quran Reader's vendored data, as `public/quran/**` stores it.
 *
 * These types describe files produced by `scripts/vendor-quran.mjs`, not an API
 * response: the text is copied from Tanzil under CC BY 3.0 and never altered
 * (ADR-0057), so the field names are Tanzil's and the ayah strings are verbatim.
 */

/** One sura as the index lists it. */
export interface SurahSummary {
  /** Tanzil's 1-based sura number, which is also the reader's only route param. */
  n: number;
  /** The sura's Arabic name, e.g. البقرة. */
  name: string;
  ayahCount: number;
  /** Tanzil's word for it; the reader renders مكية or مدنية from it. */
  revelation: 'Meccan' | 'Medinan';
  /** Where the sura falls in the order of revelation, not the order of the text. */
  revelationOrder: number;
}

export interface QuranIndex {
  source: string;
  license: string;
  /** The path of the verbatim Tanzil notice, which the licence requires us to keep. */
  notice: string;
  rivayah: string;
  ayahCount: number;
  surahs: SurahSummary[];
}

/** One sura's text. */
export interface Surah {
  n: number;
  name: string;
  /**
   * The basmalah that opens the sura, or null where there is none: Al-Fatiha
   * carries it as its first ayah instead, and At-Tawba does not open with one.
   *
   * It is stored per sura rather than as a constant because Tanzil publishes it
   * in more than one form — the two suras that follow a sura ending in a sakin
   * b mark it with a shadda, since the recitation joins them.
   */
  bismillah: string | null;
  /** The ayat in order, so `ayahs[i]` is ayah `i + 1`. Verbatim. */
  ayahs: string[];
}
