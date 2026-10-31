/**
 * The Mushaf's boundaries, as `public/quran/meta/pages.json` stores them (P5).
 *
 * The reader shows the text Ayah by Ayah, which is not a printed page — the
 * page-per-screen view waits on the KFGQPC layout's licence. What is exact, and
 * what this describes, is *where* the printed Madani Mushaf puts its boundaries:
 * 604 page starts, 30 juz, 60 hizb and 15 sajdah. A boundary is carried by the Ayah
 * it names, so the marks travel with the text instead of with a second copy of it.
 *
 * The file is produced by `scripts/vendor-quran-pages.mjs` from the same Tanzil
 * metadata the sura list comes from, under the same notice (ADR-0057), and guarded
 * by `scripts/__tests__/quran-pages.test.mjs`.
 */

/** A page, juz or hizb and the Ayah it opens on. `n` is its 1-based number. */
export interface QuranBoundary {
  n: number;
  surah: number;
  ayah: number;
}

/**
 * A sajdah Ayah. `obligatory` is the four the madhhabs agree on; `recommended` is
 * the rest, and the reader says which, because it decides whether a prostration is
 * owed or offered.
 */
export interface QuranSajda {
  surah: number;
  ayah: number;
  type: 'obligatory' | 'recommended';
}

export interface QuranPagesAsset {
  source: string;
  licence: string;
  /** The verbatim Tanzil notice this asset travels with, like every derived file. */
  notice: string;
  pages: QuranBoundary[];
  juzs: QuranBoundary[];
  hizbs: QuranBoundary[];
  sajdas: QuranSajda[];
}

/** The marks one Ayah carries, if it carries any. */
export interface QuranAyahMarks {
  /** The page this Ayah opens, when it opens one. */
  page?: number;
  juz?: number;
  hizb?: number;
  sajda?: QuranSajda['type'];
}

/** The printed Madani Mushaf's page count: the whole range a jump control accepts. */
export const QURAN_PAGE_COUNT = 604;

/**
 * What each of one sura's Ayat carries, keyed by Ayah number.
 *
 * A mark belongs to the Ayah that opens the range, so an Ayah with no mark is
 * simply inside one. The reader renders the marks it is handed and invents none.
 */
export function marksForSurah(
  asset: QuranPagesAsset,
  surah: number
): Record<number, QuranAyahMarks> {
  const marks: Record<number, QuranAyahMarks> = {};

  const add = (ayah: number, mark: QuranAyahMarks) => {
    marks[ayah] = { ...marks[ayah], ...mark };
  };

  for (const page of asset.pages) {
    if (page.surah === surah) add(page.ayah, { page: page.n });
  }
  for (const juz of asset.juzs) {
    if (juz.surah === surah) add(juz.ayah, { juz: juz.n });
  }
  for (const hizb of asset.hizbs) {
    if (hizb.surah === surah) add(hizb.ayah, { hizb: hizb.n });
  }
  for (const sajda of asset.sajdas) {
    if (sajda.surah === surah) add(sajda.ayah, { sajda: sajda.type });
  }

  return marks;
}

/**
 * The page starts as one flat `[surah, ayah, surah, ayah, …]` array.
 *
 * The jump control is a client component on the index page, so this crosses the
 * server/client boundary: 1,208 numbers rather than 604 objects, and the control
 * reads its pair by offset.
 */
export function pageStarts(asset: QuranPagesAsset): number[] {
  return asset.pages.flatMap((page) => [page.surah, page.ayah]);
}

/** Where a page begins, or null when the number names no page. */
export function pageStart(asset: QuranPagesAsset, page: number): QuranBoundary | null {
  if (!Number.isInteger(page) || page < 1 || page > QURAN_PAGE_COUNT) return null;
  return asset.pages.find((candidate) => candidate.n === page) ?? null;
}
