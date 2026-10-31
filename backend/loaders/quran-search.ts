import 'server-only';

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '@/backend/shared/logger';
import { QURAN_SEARCH_PATH, type QuranSearchRef } from '@/shared/contracts/quran-search';

/**
 * Points the index page at the built search asset (ADR-0057, P4).
 *
 * The page is static, so the version is resolved at build time from the manifest
 * `scripts/build-quran-search-index.mjs` writes — the same `?v=<hash8>` pattern the
 * Tafsir uses, and for the same reason: a rebuilt asset is a new key in every
 * cache rather than a stale body under a URL that promises `immutable`.
 *
 * The manifest is small and this is the only reader, so it is read per process and
 * never memoized past a failure.
 */

const MANIFEST = join(process.cwd(), 'public', 'quran', 'search', 'manifest.json');

interface SearchManifest {
  path: string;
  ayahs: number;
  bytes: number;
  sha256: string;
}

let manifestPromise: Promise<SearchManifest | null> | null = null;

function loadManifest(): Promise<SearchManifest | null> {
  manifestPromise ??= readFile(MANIFEST, 'utf8')
    .then((body) => JSON.parse(body) as SearchManifest)
    .catch((error) => {
      // A missing asset is a build this commit has not run yet, not a crash: the
      // reader keeps the name filter and the surface says text search is absent.
      manifestPromise = null;
      logger.warn('No built Quran search index in this build', { error: String(error) });
      return null;
    });
  return manifestPromise;
}

/**
 * What the index page needs to offer text search, or null when nothing is built.
 *
 * Null is not an error state on the page: the sura list still filters by name, and
 * a surface that cannot search says so rather than promising a box that cannot
 * answer.
 */
export async function loadQuranSearchRef(): Promise<QuranSearchRef | null> {
  if (!existsSync(MANIFEST)) return null;

  const manifest = await loadManifest();
  if (!manifest) return null;

  return {
    path: manifest.path || QURAN_SEARCH_PATH,
    version: manifest.sha256.slice(0, 8),
    bytes: manifest.bytes,
    ayahs: manifest.ayahs,
  };
}
