import {
  subscribeToPostgresChanges,
  type PostgresChangeHandlers,
} from '@/frontend/transport/supabase/realtime';
import { request } from '@/frontend/transport/http';
import type {
  NewsCategory,
  NewsOwnedSourcesSummary,
  NewsRegion,
  NewsSource,
  NewsSourceDestination,
  NewsSourceRequest,
  NewsSourceRequestInput,
  NewsSourceRequestStatus,
} from '@/shared/contracts/news';

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
  const result = await request<{
    success: boolean;
    sources: NewsSource[];
    selected: string[];
  }>('/api/me/news-sources', { cache: 'no-store' });

  return {
    sources: result.sources,
    selected: result.selected,
  };
}

/** Saves the kept ids; an empty source list means "every source". */
export async function saveNewsSourceSelection(
  sourceIds: string[]
): Promise<{ selected: string[] }> {
  const result = await request<{ success: boolean; selected: string[] }>('/api/me/news-sources', {
    method: 'PUT',
    body: JSON.stringify({ sourceIds }),
  });

  return { selected: result.selected };
}

/** The reader's one list (ADR-0130): their feeds and the links still on their way. */
export async function getMyNewsPrivateSources(): Promise<NewsOwnedSourcesSummary> {
  const result = await request<{ success: boolean } & NewsOwnedSourcesSummary>(
    '/api/me/news-private-sources',
    { cache: 'no-store' }
  );

  return {
    rows: result.rows,
    limited: result.limited,
    cap: result.cap,
    used: result.used,
  };
}

/** Removes one of this account's own feeds. */
export async function deleteNewsPrivateSource(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/me/news-private-sources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** Cancels a link still being read, or clears one that was refused. */
export async function deleteNewsSourceRequest(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/me/news-source-requests/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** Files a link for resolution; the server answers before it reads the target. */
export async function submitNewsSourceRequest(
  input: NewsSourceRequestInput
): Promise<NewsSourceRequest> {
  const result = await request<{ success: boolean; request: NewsSourceRequest }>(
    '/api/me/news-source-requests',
    { method: 'POST', body: JSON.stringify(input) }
  );

  return result.request;
}

/** The Admin Console's queue; `status` narrows it to one state. */
export async function getAdminNewsSourceRequests(
  status?: NewsSourceRequestStatus
): Promise<NewsSourceRequest[]> {
  const search = status ? `?status=${status}` : '';
  const result = await request<{ success: boolean; requests: NewsSourceRequest[] }>(
    `/api/admin/news/source-requests${search}`,
    { cache: 'no-store' }
  );

  return result.requests;
}

export async function decideNewsSourceRequest(
  id: string,
  decision:
    | {
        action: 'approve';
        category: NewsCategory;
        region: NewsRegion;
        tier: 1 | 2;
        note?: string;
        /** The feed an Admin pastes for a `needs_review` row. */
        feedUrl?: string;
        /** The reader's own list, or the catalogue (ADR-0106). */
        destination: NewsSourceDestination;
      }
    | { action: 'reject'; note?: string }
): Promise<NewsSourceRequest> {
  const result = await request<{ success: boolean; request: NewsSourceRequest }>(
    `/api/admin/news/source-requests/${id}`,
    { method: 'PATCH', body: JSON.stringify(decision) }
  );

  return result.request;
}
