import { request } from '@/frontend/transport/http';
import type {
  ScanHistoryClearResult,
  ScanHistoryEntry,
  ScanHistoryRecord,
  ScanHistoryRecordResult,
  ScanHistoryResult,
} from '@/shared/contracts/scan-history';

/**
 * The scan history's transport (#1430, ADR-0205).
 *
 * The write sends the summary the browser built - three fields and no payload -
 * so "we do not store the code" is a fact about the request on the wire, not a
 * claim about the server. The read is `no-store`: a history is account data.
 */

export const SCAN_HISTORY_PATH = '/api/scan/history';

export async function getScanHistory(): Promise<ScanHistoryEntry[]> {
  const result = await request<ScanHistoryResult>(SCAN_HISTORY_PATH, { cache: 'no-store' });
  return result.entries ?? [];
}

/** Count the code once. A failure is the caller's to ignore: a scan still worked. */
export async function recordScanHistory(record: ScanHistoryRecord): Promise<void> {
  await request<ScanHistoryRecordResult>(SCAN_HISTORY_PATH, {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

/** The whole list, gone. Answers how many rows went. */
export async function clearScanHistory(): Promise<number> {
  const result = await request<ScanHistoryClearResult>(SCAN_HISTORY_PATH, { method: 'DELETE' });
  return result.cleared ?? 0;
}
