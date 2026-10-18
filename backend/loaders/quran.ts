import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '@/backend/shared/logger';
import type { QuranIndex, Surah } from '@/shared/contracts/quran';

/**
 * Reads the vendored Quran text off disk (ADR-0057).
 *
 * There is no database and no API here on purpose: the text is a fixed asset
 * that ships with the build, so the reader resolves it at build time and the
 * rendered sura is static HTML. Every file is produced by
 * `scripts/vendor-quran.mjs` and guarded by `scripts/__tests__/quran-assets.test.mjs`.
 *
 * The data sits one directory down — `meta/` and `surah/` — because the reader
 * owns `/quran/[surah]`, and anything directly under `/quran/` would be shadowed
 * by that dynamic segment instead of being served from `public/`.
 */

const QURAN_DIR = join(process.cwd(), 'public', 'quran');

let indexPromise: Promise<QuranIndex> | null = null;

/** The 114 suras, in the order of the text. Read once per process. */
export function loadQuranIndex(): Promise<QuranIndex> {
  indexPromise ??= readJson<QuranIndex>(join(QURAN_DIR, 'meta', 'index.json')).catch((error) => {
    // A failed read must not poison the memo, or every later sura 404s.
    indexPromise = null;
    throw error;
  });
  return indexPromise;
}

/**
 * One sura's text, or null when the number names no sura. The caller decides
 * whether that is a `notFound()`.
 */
export async function loadSurah(number: number): Promise<Surah | null> {
  if (!Number.isInteger(number) || number < 1 || number > 114) return null;
  try {
    return await readJson<Surah>(surahPath(number));
  } catch (error) {
    logger.error('Failed to read a vendored sura', { number, error: String(error) });
    return null;
  }
}

/** The number of suras, for `generateStaticParams`. */
export async function loadSurahNumbers(): Promise<number[]> {
  const index = await loadQuranIndex();
  return index.surahs.map((surah) => surah.n);
}

function surahPath(number: number): string {
  return join(QURAN_DIR, 'surah', `${String(number).padStart(3, '0')}.json`);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
