import { createHiddenServicesService } from '@/backend/config/users';
import { hiddenServicesRateLimitPolicy } from '@/backend/config/rate-limiter';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { messageError } from '@/backend/transport/authenticated-handler';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import {
  UpdateHiddenServicesSchema,
  type HiddenServicesResult,
} from '@/shared/contracts/hidden-services';

/**
 * The account area's hidden services (ADR-0112): which `خدماتنا` rows this member
 * does not want to see.
 *
 * A relation, not a document — the rows are one-per-hidden-service and RLS guards
 * them — so the read answers an empty list for a member who has hidden nothing,
 * which is exactly today's sixteen-row menu. The write replaces the whole set,
 * because the settings page's truth is "these are off" and a delta would need the
 * server to guess what a half-saved page meant.
 *
 * Both calls hand the service the session's own client: `user_id` is what the
 * query filters on, and RLS is the second guard that makes that filter a policy
 * rather than a promise.
 */

export async function listHiddenServices(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const data = await createHiddenServicesService(supabase).list(userId);
      return jsonResult(200, { success: true, data } satisfies HiddenServicesResult);
    },
    { whenFailed: { success: false, error: 'تعذَّر تحميل الخدمات المخفيَّة.' } }
  );
}

export async function replaceHiddenServices(
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }

      const rateLimitResult = await checkRateLimitApi(hiddenServicesRateLimitPolicy(userId));
      if (rateLimitResult) return rateLimitResult;

      const parsed = UpdateHiddenServicesSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: parsed.error.issues[0]?.message ?? 'قائمة غير صالحة',
        });
      }

      const data = await createHiddenServicesService(supabase).replace(userId, parsed.data.hidden);
      return jsonResult(200, { success: true, data } satisfies HiddenServicesResult);
    },
    { mapError: messageError(500, 'تعذَّر حفظ الخدمات المخفيَّة') }
  );
}
