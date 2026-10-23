import 'server-only';

import { identity } from '@/backend/config/identity';
import { createNewsPreferencesServiceFor, createNewsServiceFor } from '@/backend/config/news';
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
  preferences: null,
};

/**
 * The signed-in reader's source selection, or null for a visitor with none.
 *
 * `resolveOptional` is what keeps this off the anonymous path: no session cookie
 * means no client is built and no auth round-trip happens, so the public page
 * does not pay for a preference only members can have. A read failure is the
 * same as no preference — showing the full digest is never wrong.
 */
export async function loadNewsSourcePreferences(): Promise<string[] | null> {
  try {
    const { user, client } = await identity.resolveOptional();
    if (!user || !client) return null;

    const sourceIds = await createNewsPreferencesServiceFor(client).get(user.id);
    return sourceIds.length > 0 ? sourceIds : null;
  } catch (error) {
    logger.warn("Failed to read the reader's news source selection", { error: String(error) });
    return null;
  }
}

export async function loadNewsBoard(
  params: NewsSearchParams = {},
  sourceIds: readonly string[] | null = null
): Promise<NewsBoard> {
  const query = parseNewsQuery(params);

  try {
    const service = createNewsServiceFor(getPublicSupabase());
    return await service.getBoard(query, { sourceIds });
  } catch (error) {
    logger.error('Failed to load the news board', { error: String(error) });
    return EMPTY_BOARD;
  }
}
