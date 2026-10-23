import 'server-only';

import { createNewsServiceFor } from '@/backend/config/news';
import { getPublicSupabase } from '@/backend/config/supabase';
import { logger } from '@/backend/shared/logger';
import { newsQuerySchema, type NewsBoard, type NewsQuery } from '@/shared/contracts/news';

/**
 * Reads the digest for the `/news` page.
 *
 * The page is dynamic (its `searchParams` carry the reader's query, day and
 * filter), so this is a plain read per request rather than an `unstable_cache`
 * one: caching would fight the Realtime refresh the page relies on to show a
 * digest the moment the workflow publishes it.
 *
 * A failure returns the empty board and is logged, because the page's job is to
 * say "no digest yet" rather than to 500 when the database is unreachable. The
 * one thing it must not do is invent content.
 */

export type NewsSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function parseNewsQuery(params: NewsSearchParams): NewsQuery {
  const parsed = newsQuerySchema.safeParse({
    q: firstValue(params.q),
    category: firstValue(params.category),
    date: firstValue(params.date),
  });
  if (!parsed.success) return {};

  // The pattern admits `2026-13-99`; a date Postgres would reject becomes a
  // request that falls back to the latest day rather than a 500 the reader sees.
  if (parsed.data.date && Number.isNaN(Date.parse(`${parsed.data.date}T00:00:00Z`))) {
    return { ...parsed.data, date: undefined };
  }

  return parsed.data;
}

const EMPTY_BOARD: NewsBoard = {
  day: null,
  dates: [],
  search: null,
  hasAnyDigest: false,
};

export async function loadNewsBoard(params: NewsSearchParams = {}): Promise<NewsBoard> {
  const query = parseNewsQuery(params);

  try {
    const service = createNewsServiceFor(getPublicSupabase());
    return await service.getBoard(query);
  } catch (error) {
    logger.error('Failed to load the news board', { error: String(error) });
    return EMPTY_BOARD;
  }
}
