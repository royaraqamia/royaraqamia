import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { guardRepositoryMethods, repositoryFailure } from '@/backend/shared/repository-error';
import type { ScanHistoryRecord } from '@/shared/contracts/scan-history';

/**
 * The scan history's one table (#1430, ADR-0205).
 *
 * `record` calls the definer function rather than an upsert: the row has to say
 * "this code again, one more time", and `seen_count + 1` is not a shape
 * PostgREST's `onConflict` can express. The function also re-reads `auth.uid()`,
 * so the repository passes no user id on that path at all - which is why
 * `authenticated` holds no insert or update grant (see the migration).
 *
 * The list and the clear are the member's own rows, by policy and by predicate.
 */

export interface ScanHistoryRow {
  id: string;
  kind: string;
  format: string;
  label: string | null;
  createdAt: string;
  lastSeenAt: string;
  seenCount: number;
}

export interface ScanHistoryRepository {
  /** The member's rows, newest read first, at most `limit`. */
  list(userId: string, limit: number): Promise<ScanHistoryRow[]>;
  /** Insert the code, or count it again. */
  record(input: ScanHistoryRecord): Promise<ScanHistoryRow>;
  /** Every row the member owns. Answers how many went. */
  clear(userId: string): Promise<number>;
}

export function createScanHistoryRepository(
  supabase: SupabaseClient<Database>
): ScanHistoryRepository {
  return guardRepositoryMethods<ScanHistoryRepository>({
    async list(userId, limit) {
      const { data, error } = await supabase
        .from('scan_history')
        .select('id,kind,format,label,created_at,last_seen_at,seen_count')
        .eq('user_id', userId)
        .order('last_seen_at', { ascending: false })
        .limit(limit);

      if (error) throw repositoryFailure('scanHistory.list', error);

      return (data ?? []).map(toRow);
    },

    async record(input) {
      const { data, error } = await supabase.rpc('record_scan_history', {
        p_kind: input.kind,
        p_format: input.format,
        p_label: input.label ?? null,
      });

      if (error) throw repositoryFailure('scanHistory.record', error);

      // A composite return arrives as the row itself; some PostgREST versions
      // answer a one-row array. Both are the same row, so accept both.
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw repositoryFailure('scanHistory.record', new Error('no row returned'));

      return toRow(row);
    },

    async clear(userId) {
      const { error, count } = await supabase
        .from('scan_history')
        .delete({ count: 'exact' })
        .eq('user_id', userId);

      if (error) throw repositoryFailure('scanHistory.clear', error);

      return count ?? 0;
    },
  });
}

/** The row as the table holds it, in the names the columns do not use. */
function toRow(row: {
  id: string;
  kind: string;
  format: string;
  label: string | null;
  created_at: string;
  last_seen_at: string;
  seen_count: number;
}): ScanHistoryRow {
  return {
    id: row.id,
    kind: row.kind,
    format: row.format,
    label: row.label,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    seenCount: row.seen_count,
  };
}
