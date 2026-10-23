import {
  subscribeToPostgresChanges,
  type PostgresChangeHandlers,
} from '@/frontend/transport/supabase/realtime';

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
