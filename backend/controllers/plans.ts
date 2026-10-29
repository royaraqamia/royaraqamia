import { createUsageService } from '@/backend/config/plans';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { LocalUsageReportSchema } from '@/shared/contracts/plans';

/**
 * The signed-in user's own counted actions: plan, each counter against its cap,
 * and when the daily ones return. The account card reads it; nothing here
 * mutates anything.
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

/**
 * The standing caps for the account's current plan. The offline client caches
 * them so a create can be refused on the device, before an intent the server is
 * certain to reject joins the Outbox (ADR-0075).
 */
export async function getMyCaps(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async (identity) => {
      const caps = await createUsageService().caps(identity.userId);
      return jsonResult(200, { success: true, ...caps });
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل حدود الخطَّة.' } }
  );
}

/**
 * Reconciliation for actions a device counted itself — a scan, a surah read
 * today. Each event carries a client id, so a retried report is charged once.
 */
export async function reportLocalUsage(body: unknown): Promise<HttpResult> {
  return withAuthenticatedUser(
    async (identity) => {
      const parsed = LocalUsageReportSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: 'تقرير الاستخدام غير صالح.' });
      }

      const rateLimited = await checkRateLimitApi({
        key: `usage-report:${identity.userId}`,
        limit: 20,
        windowMs: 10 * 60 * 1000,
        message: 'كثرت تقارير الاستخدام. أعد المحاولة بعد قليل.',
      });
      if (rateLimited) return rateLimited;

      const result = await createUsageService().reportLocalUsage(identity.userId, parsed.data);
      return jsonResult(200, { success: true, ...result });
    },
    { whenFailed: { success: false, error: 'تعذّر تسجيل الاستخدام.' } }
  );
}

/**
 * The account's plan page data: the current allowance and the activation
 * history, including the amount and method the operator recorded.
 */
export async function getMyPlan(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async (identity) => {
      const plan = await createUsageService().myPlan(identity.userId);
      return jsonResult(200, { success: true, ...plan });
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل بيانات الاشتراك.' } }
  );
}
