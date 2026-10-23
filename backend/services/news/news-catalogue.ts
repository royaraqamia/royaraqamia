import 'server-only';

import rawSources from '@/data/news/sources.json';
import { logger } from '@/backend/shared/logger';
import {
  isNewsCategory,
  isNewsRegion,
  type NewsRegion,
  type NewsSource,
} from '@/shared/contracts/news';

/**
 * The catalogue a reader's source selection is drawn from.
 *
 * The digest is written from `data/news/sources.json` (ADR-0076), and this is
 * that same file read for the picker: one list, so a source cannot be selectable
 * yet unfetchable or fetched yet unselectable. The file is repo-versioned and
 * validated by `scripts/news/lib.mjs` before the workflow uses it, so a malformed
 * entry is dropped here rather than throwing — a bad row must not take the whole
 * picker, or the page that reads it, down.
 *
 * A row's feed URL and freshness window are deliberately not part of
 * `NewsSource`: the browser needs a name to tick, not a feed to fetch.
 */

interface RawSource {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  region?: unknown;
  tier?: unknown;
}

function toNewsSource(value: RawSource): NewsSource | null {
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const category = typeof value.category === 'string' ? value.category : '';
  const region = typeof value.region === 'string' ? value.region : '';

  if (!id || !name || !isNewsCategory(category) || !isNewsRegion(region)) return null;

  return {
    id,
    name,
    category,
    region: region as NewsRegion,
    tier: value.tier === 2 ? 2 : 1,
  };
}

const SOURCES: NewsSource[] = (rawSources.sources as RawSource[]).flatMap((value) => {
  const source = toNewsSource(value);
  if (!source) {
    logger.warn('Dropped a malformed news source from the catalogue', {
      id: typeof value.id === 'string' ? value.id : 'unknown',
    });
    return [];
  }
  return [source];
});

const BY_ID = new Map(SOURCES.map((source) => [source.id, source]));

/** Every source a reader may pick, in the catalogue's own order. */
export function listNewsSources(): readonly NewsSource[] {
  return SOURCES;
}

export function findNewsSource(id: string): NewsSource | undefined {
  return BY_ID.get(id);
}

/** Keeps the ids the catalogue knows, in catalogue order, dropping unknown ones. */
export function knownNewsSourceIds(ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  return SOURCES.filter((source) => wanted.has(source.id)).map((source) => source.id);
}
