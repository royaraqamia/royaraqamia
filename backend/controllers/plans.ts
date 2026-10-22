import { createUsageService } from '@/backend/config/plans';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

/**
 * The signed-in user's own allowance: plan, cap, spend and remaining credits.
 * The account card reads it; nothing here mutates anything.
 */
export async function getMyUsage(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async (identity) => {
      const state = await createUsageService().state(identity.userId);
      return jsonResult(200, { success: true, state });
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل استهلاكك.' } }
  );
}
