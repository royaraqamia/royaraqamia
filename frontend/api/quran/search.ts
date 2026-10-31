import {
  normalizeArabic,
  normalizeLoose,
  type QuranSearchAsset,
  type QuranSearchRef,
} from '@/shared/contracts/quran-search';
import { logger } from '@/frontend/shared/logger';

/**
 * The client's view of the search index (ADR-0057, P4).
 *
 * The asset is the verbatim text; the comparison copies are folded here, once, in
 * the browser, with the same function the query uses. Nothing is precached and
 * nothing is bundled: the file is fetched the first time a reader reaches for text
 * search, so a reader who only wants the sura list never pays for it.
 *
 * The folded copies are held per asset version, so navigating between suras and
 * back to the index scans the same arrays rather than re-reading a megabyte.
 */

export interface QuranSearchCorpus {
  /** `normalizeArabic` of every Ayah, in reading order. */
  exact: readonly string[];
  /** `normalizeLoose` of every Ayah: the second pass over spelling variants. */
  loose: readonly string[];
  /** The Ayat as the Mushaf writes them, which is what a hit displays. */
  ayahs: readonly string[];
}

const corpusByVersion = new Map<string, Promise<QuranSearchCorpus>>();

/** The asset URL, with the version that makes it safe to cache forever. */
export function searchIndexUrl(ref: QuranSearchRef): string {
  return `${ref.path}?v=${ref.version}`;
}

/**
 * Fetches and folds the index. One request per version, however many times the
 * reader types; a failed request is forgotten rather than cached, so a retry can
 * still succeed.
 */
export function loadSearchCorpus(ref: QuranSearchRef): Promise<QuranSearchCorpus> {
  const key = searchIndexUrl(ref);
  const known = corpusByVersion.get(key);
  if (known) return known;

  const request = fetch(key, { credentials: 'same-origin' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`search index responded ${response.status}`);
      const asset = (await response.json()) as QuranSearchAsset;
      if (!Array.isArray(asset.ayahs) || asset.ayahs.length !== ref.ayahs) {
        throw new Error(
          `search index has ${asset.ayahs?.length ?? 0} Ayat, the manifest says ${ref.ayahs}`
        );
      }
      return {
        ayahs: asset.ayahs,
        exact: asset.ayahs.map((ayah) => normalizeArabic(ayah)),
        loose: asset.ayahs.map((ayah) => normalizeLoose(ayah)),
      } satisfies QuranSearchCorpus;
    })
    .catch((error: unknown) => {
      corpusByVersion.delete(key);
      logger.error('Failed to load the Quran search index', { error: String(error) });
      throw error;
    });

  corpusByVersion.set(key, request);
  return request;
}
