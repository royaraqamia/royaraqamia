import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createScanHistoryRepository } from '@/backend/repositories/scan-history/scan-history-repository';
import { ScanHistoryService } from '@/backend/services/scan-history/scan-history-service';

/**
 * The scan history's composition (#1430, ADR-0205).
 *
 * The container is the one place that names the implementation, so the route and
 * the assistant's tool both ask here rather than importing a repository across a
 * service boundary (`layers/no-cross-layer-import`).
 *
 * User-scoped on purpose: the repository runs on the member's own client, so RLS
 * is the boundary and the explicit `user_id` predicate is the second lock.
 */
export { createScanHistoryRepository };

export function createScanHistoryService(supabase?: SupabaseClient<Database>): ScanHistoryService {
  return new ScanHistoryService({
    scanHistory: createScanHistoryRepository(supabase ?? getAdminSupabase()),
  });
}
