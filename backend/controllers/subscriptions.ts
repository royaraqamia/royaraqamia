import * as Sentry from '@sentry/nextjs';
import { createStatusGuard, parseAdminListQuery } from '@/backend/controllers/admin-list';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { createDefaultSubscriptionRequestService } from '@/backend/config/subscriptions';
import {
  SubscriptionRequestNotFoundError,
  SubscriptionRequestRateLimitError,
} from '@/backend/services/subscriptions/subscriptions-service';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { zodFieldErrors } from '@/backend/shared/zod-field-errors';
import {
  SUBSCRIPTION_REQUEST_STATUSES,
  SubscriptionRequestSchema,
  SubscriptionRequestUpdateSchema,
  type SubscriptionRequest,
} from '@/shared/contracts/subscriptions';

interface SubscriptionRequestActionResult {
  success: boolean;
  data?: SubscriptionRequest;
  referenceCode?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

interface MySubscriptionRequestsResult {
  success: boolean;
  data?: SubscriptionRequest[];
  error?: string;
}

const isSubscriptionRequestStatus = createStatusGuard(SUBSCRIPTION_REQUEST_STATUSES);

/**
 * The «اشترِك الآن» form. Account-gated rather than anonymous, unlike the other
 * lead forms: nothing is charged on the site and an Admin activates the plan on
 * an account id, so a request without an account could never be acted on.
 */
export async function submitSubscriptionRequest(body: unknown): Promise<HttpResult> {
  const parsed = SubscriptionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      error: 'تحقق من الحقول المدخلة.',
      fieldErrors: zodFieldErrors(parsed.error),
    } satisfies SubscriptionRequestActionResult);
  }

  return withAuthenticatedUser(
    async ({ userId }) => {
      // A payload that names an account is a replayed offline submission: it may
      // only be written for the account that queued it. Rejecting a mismatch
      // with a 4xx is what turns "wrong account" into a permanent Outbox
      // failure the reader can see, instead of retrying under whoever is signed
      // in now (#1084).
      if (parsed.data.user_id && parsed.data.user_id !== userId) {
        return jsonResult(403, {
          success: false,
          error: 'هذا الطلب مُسجَّل لحساب آخر. سجّل الدخول بالحساب الذي أرسله.',
        } satisfies SubscriptionRequestActionResult);
      }

      try {
        const request = await createDefaultSubscriptionRequestService().submit(parsed.data, {
          userId,
        });

        return jsonResult(200, {
          success: true,
          referenceCode: request.reference_code,
        } satisfies SubscriptionRequestActionResult);
      } catch (error) {
        Sentry.captureException(error);

        if (error instanceof SubscriptionRequestRateLimitError) {
          return jsonResult(429, {
            success: false,
            error: error.message,
          } satisfies SubscriptionRequestActionResult);
        }

        return jsonResult(500, {
          success: false,
          error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
        } satisfies SubscriptionRequestActionResult);
      }
    },
    { whenFailed: { success: false, error: 'يلزم تسجيل الدخول لإرسال طلب الاشتراك.' } }
  );
}

/** The signed-in reader's own requests, newest first. */
export async function listMySubscriptionRequests(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      const data = await createDefaultSubscriptionRequestService().listMine(userId);
      return jsonResult(200, { success: true, data } satisfies MySubscriptionRequestsResult);
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل طلباتك.' } }
  );
}

export async function listSubscriptionRequests(
  page: number,
  pageSize: number,
  status?: string | null,
  search?: string | null
): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const result = await createDefaultSubscriptionRequestService().list(
        parseAdminListQuery(page, pageSize, status, search, isSubscriptionRequestStatus)
      );
      return jsonResult(200, result);
    },
    { whenFailed: { success: false, error: 'تعذر تحميل طلبات الاشتراك.' } }
  );
}

export async function updateSubscriptionRequest(id: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = SubscriptionRequestUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'تحقق من الحقول المدخلة.',
          fieldErrors: zodFieldErrors(parsed.error),
        } satisfies SubscriptionRequestActionResult);
      }

      try {
        const data = await createDefaultSubscriptionRequestService().update(id, parsed.data);
        return jsonResult(200, { success: true, data } satisfies SubscriptionRequestActionResult);
      } catch (error) {
        if (error instanceof SubscriptionRequestNotFoundError) {
          return jsonResult(404, {
            success: false,
            error: error.message,
          } satisfies SubscriptionRequestActionResult);
        }
        if (error instanceof SubscriptionRequestRateLimitError) {
          return jsonResult(429, {
            success: false,
            error: error.message,
          } satisfies SubscriptionRequestActionResult);
        }
        throw error;
      }
    },
    { whenFailed: { success: false, error: 'تعذّر تحديث طلب الاشتراك.' } }
  );
}
