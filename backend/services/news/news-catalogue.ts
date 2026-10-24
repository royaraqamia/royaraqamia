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
 * The base is `data/news/sources.json` — the same file the workflow fetches
 * (ADR-0076) — so a source cannot be selectable yet unfetchable. The file is
 * repo-versioned and validated by `scripts/news/lib.mjs` before the workflow
 * uses it, so a malformed entry is dropped here rather than throwing: a bad row
 * must not take the whole picker, or the page that reads it, down.
 *
 * Sources an Admin approved live in `news_sources` (ADR-0078) and are merged on
 * top, file first. A failed read of the additions costs the picker its new rows
 * for one request, never the catalogue itself.
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

const FILE_SOURCES: NewsSource[] = (rawSources.sources as RawSource[]).flatMap((value) => {
  const source = toNewsSource(value);
  if (!source) {
    logger.warn('Dropped a malformed news source from the catalogue', {
      id: typeof value.id === 'string' ? value.id : 'unknown',
    });
    return [];
  }
  return [source];
});

const FILE_BY_ID = new Map(FILE_SOURCES.map((source) => [source.id, source]));

/** The repo-versioned list, in its own order. */
export function listFileSources(): readonly NewsSource[] {
  return FILE_SOURCES;
}

export function findFileSource(id: string): NewsSource | undefined {
  return FILE_BY_ID.get(id);
}

/**
 * The file list first, then approved additions it does not already carry. The
 * file wins a collision: the reviewed list is the authority on its own ids.
 */
export function mergeNewsSources(
  base: readonly NewsSource[],
  added: readonly NewsSource[]
): NewsSource[] {
  const seen = new Set(base.map((source) => source.id));
  return [...base, ...added.filter((source) => !seen.has(source.id))];
}

/** Keeps the ids a catalogue knows, in its order, dropping everything else. */
export function keepKnownSourceIds(
  ids: readonly string[],
  sources: readonly NewsSource[]
): string[] {
  const wanted = new Set(ids);
  return sources.filter((source) => wanted.has(source.id)).map((source) => source.id);
}

/** The list as the picker and the preferences write need it. */
export interface NewsCatalogue {
  list(): Promise<readonly NewsSource[]>;
}

export function createNewsCatalogue(
  loadApproved: () => Promise<readonly NewsSource[]>
): NewsCatalogue {
  return {
    async list(): Promise<readonly NewsSource[]> {
      try {
        return mergeNewsSources(FILE_SOURCES, await loadApproved());
      } catch (error) {
        logger.warn('Fell back to the repo source list only', { error: String(error) });
        return FILE_SOURCES;
      }
    },
  };
}
