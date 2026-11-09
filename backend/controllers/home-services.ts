import { createHomeServicesService } from '@/backend/config/users';
import { homeServicesRateLimitPolicy } from '@/backend/config/rate-limiter';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { messageError } from '@/backend/transport/authenticated-handler';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import {
  UpdateHomeServicesSchema,
  type HomeServicesResult,
} from '@/shared/contracts/home-services';

/**
 * The homepage's app list (ADR-0143): which app routes this member keeps as
 * tabs, in order.
 *
 * A relation, not a document — the rows are one-per-app and RLS guards them —
 * so the read answers an empty list for a member who added nothing, which is
 * exactly the empty state the homepage draws. The write replaces the whole
 * ordered set, because a strip that half-saved would be a strip the member
 * cannot recognise.
 *
 * Both calls hand the service the session's own client: `user_id` is what the
 * query filters on, and RLS is the second guard that makes that filter a policy
 * rather than a promise.
 */

export async function listHomeServices(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const data = await createHomeServicesService(supabase).list(userId);
      return jsonResult(200, { success: true, data } satisfies HomeServicesResult);
    },
    { whenFailed: { success: false, error: 'تعذَّر تحميل تطبيقاتك.' } }
  );
}

export async function replaceHomeServices(
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }

      const rateLimitResult = await checkRateLimitApi(homeServicesRateLimitPolicy(userId));
      if (rateLimitResult) return rateLimitResult;

      const parsed = UpdateHomeServicesSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: parsed.error.issues[0]?.message ?? 'قائمة غير صالحة',
        });
      }

      const data = await createHomeServicesService(supabase).replace(userId, parsed.data.services);
      return jsonResult(200, { success: true, data } satisfies HomeServicesResult);
    },
    { mapError: messageError(500, 'تعذَّر حفظ تطبيقاتك') }
  );
}
