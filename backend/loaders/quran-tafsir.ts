import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '@/backend/shared/logger';
import type {
  QuranSurahTafsir,
  QuranTafsirEdition,
  QuranTafsirIndex,
  QuranTafsirManifest,
  SurahTafsirRef,
} from '@/shared/contracts/quran-tafsir';

/**
 * Reads the vendored Tafsir off disk (ADR-0057).
 *
 * The text is a fixed asset like the Quran's own: no database, no API, and no
 * third party in the path of a page view. `scripts/vendor-quran-tafsir.mjs`
 * produces the files; `scripts/__tests__/quran-assets.test.mjs` guards them.
 *
 * The Tafsir sits under `tafsir/` beside `surah/` and `meta/` for the same reason
 * they do: `/quran/[surah]` owns `/quran/<number>`, so anything directly under
 * `/quran/` would be shadowed by that segment instead of served from `public/`.
 */

const TAFSIR_DIR = join(process.cwd(), 'public', 'quran', 'tafsir');

/** The edition this build ships. A second is a data addition, not a redesign. */
export const TAFSIR_EDITION = 'moyassar';

let editionPromise: Promise<QuranTafsirEdition | null> | null = null;
let manifestPromise: Promise<QuranTafsirManifest | null> | null = null;

/** The shipped edition's line, or null when no tafsir has been vendored yet. */
export function loadTafsirEdition(): Promise<QuranTafsirEdition | null> {
  editionPromise ??= readJson<QuranTafsirIndex>(join(TAFSIR_DIR, TAFSIR_EDITION, 'index.json'))
    .then((index) => index.editions.find((edition) => edition.id === TAFSIR_EDITION) ?? null)
    .catch((error) => {
      // A failed read must not poison the memo: the asset may arrive with a
      // commit, and the next build should see it.
      editionPromise = null;
      logger.warn('No vendored tafsir in this build', { error: String(error) });
      return null;
    });
  return editionPromise;
}

function loadManifest(): Promise<QuranTafsirManifest | null> {
  manifestPromise ??= readJson<QuranTafsirManifest>(
    join(TAFSIR_DIR, TAFSIR_EDITION, 'manifest.json')
  ).catch(() => {
    manifestPromise = null;
    return null;
  });
  return manifestPromise;
}

/** One sura's tafsir, or null when the edition has no file for it. */
export async function loadSurahTafsir(number: number): Promise<QuranSurahTafsir | null> {
  if (!Number.isInteger(number) || number < 1 || number > 114) return null;
  try {
    return await readJson<QuranSurahTafsir>(tafsirPath(number));
  } catch (error) {
    logger.error('Failed to read a vendored tafsir', { number, error: String(error) });
    return null;
  }
}

/**
 * What a sura's page needs to offer its tafsir: the URL, the version that makes
 * it immutable, and the credit it carries. Null when nothing is vendored, so the
 * surface renders without a control rather than with a dead one.
 */
export async function loadSurahTafsirRef(number: number): Promise<SurahTafsirRef | null> {
  const [edition, manifest] = await Promise.all([loadTafsirEdition(), loadManifest()]);
  if (!edition) return null;

  const entry = manifest?.surahs.find((surah) => surah.surah === number);
  if (!entry) return null;

  return {
    edition: edition.id,
    path: `/quran/tafsir/${edition.id}/${String(number).padStart(3, '0')}.json`,
    version: entry.sha256.slice(0, 8),
    attribution: entry.attribution ?? edition.attribution,
    licence: edition.licence,
    licenceUrl: edition.licenceUrl,
    source: edition.source,
  };
}

function tafsirPath(number: number): string {
  return join(TAFSIR_DIR, TAFSIR_EDITION, `${String(number).padStart(3, '0')}.json`);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
