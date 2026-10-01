import * as Sentry from '@sentry/nextjs';
import { createStatusGuard, parseAdminListQuery } from '@/backend/controllers/admin-list';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { createDefaultRetainerService } from '@/backend/config/retainers';
import {
  RetainerNotFoundError,
  RetainerRateLimitError,
} from '@/backend/services/retainers/retainers-service';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { zodFieldErrors } from '@/backend/shared/zod-field-errors';
import {
  RETAINER_STATUSES,
  RetainerEditSchema,
  RetainerSchema,
  RetainerUpdateSchema,
  type Retainer,
} from '@/shared/contracts/retainers';

interface RetainerActionResult {
  success: boolean;
  data?: Retainer;
  referenceCode?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const isRetainerStatus = createStatusGuard(RETAINER_STATUSES);

/**
 * Public and unauthenticated by design: a prospective Client is the coldest
 * audience on the site and requiring an account would cost the lead. Protected
 * by a per-IP rate limit. A signed-in visitor is attributed opportunistically
 * when a session happens to exist.
 */
export async function submitRetainer(body: unknown, ip: string): Promise<HttpResult> {
  const parsed = RetainerSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      error: 'تحقق من الحقول المدخلة.',
      fieldErrors: zodFieldErrors(parsed.error),
    } satisfies RetainerActionResult);
  }

  try {
    const { user } = await getOptionalUser();
    const retainer = await createDefaultRetainerService().submit(parsed.data, {
      ip,
      userId: user?.id ?? null,
    });

    return jsonResult(200, {
      success: true,
      referenceCode: retainer.reference_code,
    } satisfies RetainerActionResult);
  } catch (error) {
    Sentry.captureException(error);

    if (error instanceof RetainerRateLimitError) {
      return jsonResult(429, {
        success: false,
        error: error.message,
      } satisfies RetainerActionResult);
    }

    return jsonResult(500, {
      success: false,
      error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
    } satisfies RetainerActionResult);
  }
}

/**
 * The Retainer domain errors an Admin request may surface. Returning `null` lets
 * the Admin adapter fall back to its own `500` body.
 */
function mapRetainerError(error: unknown): HttpResult | null {
  if (error instanceof RetainerNotFoundError) {
    return jsonResult(404, {
      success: false,
      error: error.message,
    } satisfies RetainerActionResult);
  }
  return null;
}

export async function listRetainers(
  page: number,
  pageSize: number,
  status?: string | null,
  search?: string | null
): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const result = await createDefaultRetainerService().list(
        parseAdminListQuery(page, pageSize, status, search, isRetainerStatus)
      );
      return jsonResult(200, result);
    },
    { whenFailed: { success: false, error: 'تعذر تحميل التَّعاقُدات.' } }
  );
}

export async function updateRetainer(id: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = RetainerUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'تحقق من الحقول المدخلة.',
          fieldErrors: zodFieldErrors(parsed.error),
        } satisfies RetainerActionResult);
      }

      const data = await createDefaultRetainerService().update(id, parsed.data);
      return jsonResult(200, { success: true, data } satisfies RetainerActionResult);
    },
    {
      mapError: mapRetainerError,
      whenFailed: { success: false, error: 'تعذّر تحديث التَّعاقُد.' },
    }
  );
}

interface MyRetainersResult {
  success: boolean;
  data?: Retainer[];
  error?: string;
}

interface MyRetainerResult {
  success: boolean;
  data?: Retainer;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * The signed-in visitor's own retainers. Account-gated rather than anonymous:
 * the account is what proves ownership, so an anonymous submission cannot be
 * listed or edited.
 */
export async function listMyRetainers(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      const data = await createDefaultRetainerService().listMine(userId);
      return jsonResult(200, { success: true, data } satisfies MyRetainersResult);
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل طلباتك.' } }
  );
}

/** Edits one retainer the visitor owns; a guessed id yields the same `404`. */
export async function updateMyRetainer(id: string, body: unknown): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      const parsed = RetainerEditSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'تحقق من الحقول المدخلة.',
          fieldErrors: zodFieldErrors(parsed.error),
        } satisfies MyRetainerResult);
      }

      const data = await createDefaultRetainerService().updateOwned(userId, id, parsed.data);
      return jsonResult(200, { success: true, data } satisfies MyRetainerResult);
    },
    {
      mapError: (error) => {
        if (error instanceof RetainerNotFoundError) {
          return jsonResult(404, {
            success: false,
            error: error.message,
          } satisfies MyRetainerResult);
        }
        if (error instanceof RetainerRateLimitError) {
          return jsonResult(429, {
            success: false,
            error: error.message,
          } satisfies MyRetainerResult);
        }
        return null;
      },
      whenFailed: { success: false, error: 'تعذّر تحديث الطَّلب.' },
    }
  );
}
