import {
  NEWS_CATEGORIES,
  type NewsBoard,
  type NewsCategory,
  type NewsDay,
  type NewsSearch,
} from '@/shared/contracts/news';
import { SNAPSHOT_SCREENFUL } from '@/frontend/shared/local-store/snapshot';

/**
 * What `/news` records for its public snapshot (#555).
 *
 * The digest is published, identical for every reader and kept for
 * {@link NEWS_RETENTION_DAYS} days — so the copy a reader looked at on the train
 * is exactly what they want in the tunnel, marked stale and read-only. What is
 * *not* recorded is the part of the board that belongs to a reader: which digest
 * is theirs (`personal`) and what their source selection did to the shared one
 * (`preferences`). Both are reader-scoped, and the route refuses a snapshot for
 * them by answering `no-store` (`app/api/news/board/route.ts`); this shape makes
 * the rule structural rather than a promise, so a field the surface does not
 * publish cannot reach storage.
 *
 * `capturedAt` is what makes staleness nameable: the digest's own date says
 * which morning it reports, but not when the reader last saw it.
 */
export interface NewsDigestSnapshot {
  capturedAt: string;
  day: NewsDay | null;
  dates: string[];
  search: NewsSearch | null;
  hasAnyDigest: boolean;
  /** The chips the day actually contains, so a stale view keeps its filter row. */
  categories: NewsCategory[];
}

/** The categories a set of stories uses, in the page's own order. */
export function uniqueCategories(values: readonly NewsCategory[]): NewsCategory[] {
  const seen = new Set<NewsCategory>();
  for (const value of values) seen.add(value);
  return NEWS_CATEGORIES.filter((category) => seen.has(category));
}

/**
 * The board as the snapshot keeps it: the rows it rendered, and nothing about
 * who asked for them.
 */
export function toNewsDigestSnapshot(board: NewsBoard, capturedAt: string): NewsDigestSnapshot {
  const categories = uniqueCategories(
    board.search
      ? board.search.hits.map((hit) => hit.category)
      : (board.day?.stories ?? []).map((story) => story.category)
  );

  return {
    capturedAt,
    day: board.day,
    dates: board.dates,
    search: board.search,
    hasAnyDigest: board.hasAnyDigest,
    categories,
  };
}

/**
 * The byte budget's trim for a digest (#555): the first screenful of stories.
 *
 * A digest is at most twelve stories, so this only matters for a search, whose
 * hits are a month wide. Halving keeps the match the reader typed first, which
 * is the one they were looking for.
 */
export function trimNewsSnapshot(snapshot: NewsDigestSnapshot): NewsDigestSnapshot | null {
  if (snapshot.day) {
    const stories = snapshot.day.stories.slice(0, SNAPSHOT_SCREENFUL);
    if (stories.length === 0) return null;
    return { ...snapshot, day: { ...snapshot.day, stories } };
  }

  if (snapshot.search) {
    const hits = snapshot.search.hits.slice(0, SNAPSHOT_SCREENFUL);
    if (hits.length === 0) return null;
    return { ...snapshot, search: { ...snapshot.search, hits } };
  }

  return null;
}
