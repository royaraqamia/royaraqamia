import { request } from '@/frontend/transport/http';
import type { QuranSyncSnapshot } from '@/shared/contracts/quran';

/**
 * The pull half of the reader's sync (ADR-0056): every record the account holds,
 * from the cursor this device last advanced to. `since` is null on a first pull,
 * which asks for the whole (tiny) set.
 *
 * It is a plain read, so it is not an Outbox intent: a pull that fails costs
 * latency and nothing else, and the next focus or reconnect runs it again.
 */
export function pullQuranSync(since: string | null): Promise<QuranSyncSnapshot> {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return request<QuranSyncSnapshot>(`/quran/api/sync${query}`);
}
