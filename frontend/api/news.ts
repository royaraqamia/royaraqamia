import {
  subscribeToPostgresChanges,
  type PostgresChangeHandlers,
} from '@/frontend/transport/supabase/realtime';
import { request } from '@/frontend/transport/http';
import type { NewsSource } from '@/shared/contracts/news';

/**
 * The digest table the `/news` page watches.
 *
 * Exported so `scripts/__tests__/realtime-hint-tables.test.ts` can pin it to the
 * publication migrations: a table a surface subscribes to but the project does
 * not publish delivers nothing, forever, and silently (ADR-0060). Unlike the
 * product hints this is a public table — no ownership filter — because the digest
 * is the same for every visitor.
 */
export const NEWS_SYNC_HINT_TABLES = ['news_digests'] as const;

export function subscribeToNewsDigestChanges(handlers: PostgresChangeHandlers): () => void {
  return subscribeToPostgresChanges({
    channel: 'news_digests_live',
    table: 'news_digests',
    handlers,
  });
}

/** The picker's data: the catalogue and the ids this account kept. */
export interface NewsSourceSelection {
  sources: NewsSource[];
  selected: string[];
}

/**
 * The catalogue and the account's own selection arrive together, because a
 * picker that could render the sources but not the ticks would flash an empty
 * checklist on every open.
 */
export async function getNewsSourceSelection(): Promise<NewsSourceSelection> {
  const result = await request<{ success: boolean; sources: NewsSource[]; selected: string[] }>(
    '/api/me/news-sources',
    { cache: 'no-store' }
  );

  return { sources: result.sources, selected: result.selected };
}

/** Saves the kept ids; an empty list means "every source", now and later. */
export async function saveNewsSourceSelection(sourceIds: string[]): Promise<string[]> {
  const result = await request<{ success: boolean; selected: string[] }>('/api/me/news-sources', {
    method: 'PUT',
    body: JSON.stringify({ sourceIds }),
  });

  return result.selected;
}
