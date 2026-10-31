import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '@/backend/shared/logger';
import type { QuranPagesAsset } from '@/shared/contracts/quran-pages';

/**
 * Reads the vendored Mushaf boundaries (P5).
 *
 * The same rule as the text and the Tafsir: a fixed asset, read at build time, no
 * database and no API. The sura pages are static, so every mark on them is decided
 * when the page is rendered, and a reader with no network sees the same boundaries
 * as one with it.
 */

const PAGES = join(process.cwd(), 'public', 'quran', 'meta', 'pages.json');

let assetPromise: Promise<QuranPagesAsset | null> | null = null;

/**
 * The boundaries, or null when this build has none.
 *
 * Null is not an error on the page: the reader then renders the text it has always
 * rendered, without marks. A mark is an addition to the reading surface, never a
 * precondition for it.
 */
export function loadQuranPages(): Promise<QuranPagesAsset | null> {
  assetPromise ??= readFile(PAGES, 'utf8')
    .then((body) => JSON.parse(body) as QuranPagesAsset)
    .catch((error) => {
      // A failed read must not poison the memo: the asset may arrive with a commit.
      assetPromise = null;
      logger.warn('No vendored Mushaf boundaries in this build', { error: String(error) });
      return null;
    });
  return assetPromise;
}
