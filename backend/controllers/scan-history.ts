import { createScanHistoryService } from '@/backend/config/scan-history';
import { scanHistoryRateLimitPolicy } from '@/backend/config/rate-limiter';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import {
  ScanHistoryRecordSchema,
  type ScanHistoryClearResult,
  type ScanHistoryRecordResult,
  type ScanHistoryResult,
} from '@/shared/contracts/scan-history';

/**
 * The scan history's three routes (#1430, ADR-0205).
 *
 * The read is what the scan surface draws; the write is the one sentence the
 * Scanner sends after a code is read (a summary the browser built, never the
 * payload); the delete is the member clearing their own list. Each handler
 * parses, calls one service and shapes the answer, and every answer is account
 * data, so the seam marks it `no-store`.
 */

const CROSS_ORIGIN_REFUSAL = 'طلب من أصل غير معروف.';
const INVALID_REQUEST = 'الطلب غير مكتمل.';
const LIST_FAILED = 'تعذّر تحميل سجل المسح.';
const RECORD_FAILED = 'تعذّر حفظ سجل المسح.';
const CLEAR_FAILED = 'تعذّر حذف سجل المسح.';

function refusedSameOrigin(): HttpResult {
  return jsonResult(403, { success: false, error: CROSS_ORIGIN_REFUSAL });
}

/** The list, newest read first. */
export async function listScanHistory(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const entries = await createScanHistoryService(supabase).list(userId);
      const body: ScanHistoryResult = { success: true, entries };
      return jsonResult(200, body);
    },
    { mapError: () => jsonResult(500, { success: false, error: LIST_FAILED }) }
  );
}

/** One code, counted. A code scanned twice is one row saying "2". */
export async function recordScan(
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) return refusedSameOrigin();

      const rateLimitResult = await checkRateLimitApi(scanHistoryRateLimitPolicy(userId));
      if (rateLimitResult) return rateLimitResult;

      const parsed = ScanHistoryRecordSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: parsed.error.issues[0]?.message ?? INVALID_REQUEST,
        });
      }

      const entry = await createScanHistoryService(supabase).record(parsed.data);
      const answer: ScanHistoryRecordResult = { success: true, entry };
      return jsonResult(200, answer);
    },
    { mapError: () => jsonResult(500, { success: false, error: RECORD_FAILED }) }
  );
}

/** The member's own list, gone. Answers how many rows went. */
export async function clearScanHistory(headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) return refusedSameOrigin();

      const rateLimitResult = await checkRateLimitApi(scanHistoryRateLimitPolicy(userId));
      if (rateLimitResult) return rateLimitResult;

      const cleared = await createScanHistoryService(supabase).clear(userId);
      const answer: ScanHistoryClearResult = { success: true, cleared };
      return jsonResult(200, answer);
    },
    { mapError: () => jsonResult(500, { success: false, error: CLEAR_FAILED }) }
  );
}
