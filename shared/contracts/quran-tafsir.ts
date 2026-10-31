/**
 * The vendored Tafsir, as the build ships it (ADR-0057).
 *
 * One edition is stored, keyed by slug, so a second is a data addition rather
 * than a redesign. The files are produced by `scripts/vendor-quran-tafsir.mjs`
 * and read by `backend/loaders/quran-tafsir.ts`; the reader fetches one sura's
 * file the first time a reader opens a tafsir on it.
 */

/** One Ayah's tafsir, or `null` when the edition does not cover it. */
export interface QuranTafsirAyah {
  ayah: number;
  text: string | null;
}

/** One sura's tafsir, verbatim from the source. */
export interface QuranSurahTafsir {
  edition: string;
  surah: number;
  name: string;
  ayahCount: number;
  /** The edition's own credit, as the source publishes it. */
  attribution: string | null;
  source: string;
  licence: string;
  ayat: QuranTafsirAyah[];
}

/** The edition's line in `index.json`. */
export interface QuranTafsirEdition {
  id: string;
  name: string;
  author: string | null;
  licence: string;
  licenceUrl: string;
  source: string;
  corpus: string;
  attribution: string | null;
  suras: number;
  ayat: number;
  covered: number;
  bytes: number;
  complete: boolean;
}

export interface QuranTafsirIndex {
  editions: QuranTafsirEdition[];
}

/** One sura's entry in the edition's `manifest.json`. */
export interface QuranTafsirManifestSurah {
  surah: number;
  bytes: number;
  sha256: string;
  covered: number;
  missing: number;
  attribution: string | null;
}

export interface QuranTafsirManifest {
  edition: string;
  holder: string;
  holderAr: string;
  licence: string;
  licenceUrl: string;
  source: string;
  corpus: string;
  suras: number;
  ayat: number;
  covered: number;
  bytes: number;
  complete: boolean;
  surahs: QuranTafsirManifestSurah[];
}

/**
 * What the reader needs to offer a tafsir on one sura: where the file is, the
 * credit it must carry, and the hash that makes the URL safe to cache forever.
 */
export interface SurahTafsirRef {
  edition: string;
  /** `/quran/tafsir/<slug>/<surah3>.json` */
  path: string;
  /** The file's `?v=`, so a re-vendor is a new key in every cache. */
  version: string;
  attribution: string | null;
  licence: string;
  licenceUrl: string;
  source: string;
}
