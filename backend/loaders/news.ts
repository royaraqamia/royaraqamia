import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { identity } from '@/backend/config/identity';
import {
  createNewsPersonalDigestServiceFor,
  createNewsPreferencesServiceFor,
  createNewsServiceFor,
} from '@/backend/config/news';
import { getPublicSupabase } from '@/backend/config/supabase';
import type { Database } from '@/backend/models/database.types';
import { logger } from '@/backend/shared/logger';
import {
  newsQuerySchema,
  type NewsBoard,
  type NewsPersonalView,
  type NewsQuery,
  type NewsSearchSuggestions,
  type NewsSourcePreferences,
} from '@/shared/contracts/news';

/**
 * Reads everything `/news` renders for one request.
 *
 * The page is dynamic (its `searchParams` carry the reader's query, day, filter
 * and which digest they asked for), so this is a plain read per request rather
 * than an `unstable_cache` one: caching would fight the Realtime refresh the
 * page relies on to show a digest the moment the workflow publishes it.
 *
 * A failure returns the empty board and is logged, because the page's job is to
 * say "no digest yet" rather than to 500 when the database is unreachable. The
 * one thing it must not do is invent content.
 */

export type NewsSearchParams = Record<string, string | string[] | undefined>;

/** `mine` is the reader's own digest when they have one; `public` is always the shared one. */
export type NewsView = 'mine' | 'public';

export function parseNewsView(params: NewsSearchParams): NewsView {
  return firstValue(params.view) === 'public' ? 'public' : 'mine';
}

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
  personal: null,
};

interface Reader {
  userId: string;
  client: SupabaseClient<Database>;
  preferences: NewsSourcePreferences;
}

/**
 * The signed-in reader, or null for a visitor.
 *
 * `resolveOptional` is what keeps this off the anonymous path: no session cookie
 * means no client is built and no auth round-trip happens, so the public page
 * does not pay for a preference only members can have. A failed read is the same
 * as no preference — showing the shared digest is never wrong.
 */
async function readReader(): Promise<Reader | null> {
  try {
    const { user, client } = await identity.resolveOptional();
    if (!user || !client) return null;

    const preferences = await createNewsPreferencesServiceFor(client).get(user.id);
    return { userId: user.id, client, preferences };
  } catch (error) {
    logger.warn("Failed to read the reader's news preferences", { error: String(error) });
    return null;
  }
}

async function loadSharedBoard(
  query: NewsQuery,
  sourceIds: readonly string[] | null
): Promise<NewsBoard> {
  const service = createNewsServiceFor(getPublicSupabase());
  return service.getBoard(query, { sourceIds });
}

export async function loadNewsBoard(
  params: NewsSearchParams = {},
  view: NewsView = 'mine'
): Promise<NewsBoard> {
  const query = parseNewsQuery(params);
  try {
    const reader = await readReader();
    const shared = await loadSharedBoard(query, reader?.preferences.sourceIds ?? null);

    if (!reader) {
      return { ...shared, personal: null };
    }

    if (!reader.preferences.personalEnabled) {
      return {
        ...shared,
        personal: { enabled: false, available: false, active: false },
      };
    }

    const personalService = createNewsPersonalDigestServiceFor(reader.client);
    // A search is the retained month as published, so it never answers with a
    // personal digest; the personal read is skipped rather than filtered.
    const personalDay = shared.search ? null : await personalService.get(reader.userId, query);
    // Without an explicit day, `getLatest` may return a digest older than the
    // shared one (the nightly run skipped this reader, or generation failed).
    // Showing that as today's briefing would present stale news, so the latest
    // personal digest only counts when it is for the day the board shows. An
    // explicit `?date=` is already pinned by `getByDate`; with no shared digest
    // at all there is nothing to compare against and the latest may be shown.
    const personalMatchesDay =
      personalDay !== null &&
      (query.date !== undefined ||
        shared.day === null ||
        personalDay.digest.date === shared.day.digest.date);
    const active = personalMatchesDay && view !== 'public';

    const personal: NewsPersonalView = {
      enabled: true,
      available: personalMatchesDay,
      active,
    };

    return {
      ...shared,
      day: active ? personalDay : shared.day,
      // The personal digest was built from the reader's own sources, so the
      // read-time filter (and its fallback notice) has nothing left to do.
      preferences: active ? null : shared.preferences,
      personal,
    };
  } catch (error) {
    logger.error('Failed to load the news board', { error: String(error) });
    return EMPTY_BOARD;
  }
}

/**
 * Story suggestions for the `/news` search combobox.
 *
 * Not cached: it is keyed on the visitor's keystrokes and served on the request
 * path. A read failure is thrown rather than answered as "no results", so the
 * combobox can name the failure instead of implying the month is empty
 * (ADR-0031).
 */
export async function loadNewsSearch(term: string): Promise<NewsSearchSuggestions> {
  const service = createNewsServiceFor(getPublicSupabase());
  const hits = await service.searchSuggestions(term);
  return { hits };
}
