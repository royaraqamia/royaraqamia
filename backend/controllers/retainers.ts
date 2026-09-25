import * as Sentry from '@sentry/nextjs';
import type { z } from 'zod';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { createDefaultRetainerService } from '@/backend/config/retainers';
import {
  RetainerNotFoundError,
  RetainerRateLimitError,
} from '@/backend/services/retainers/retainers-service';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import {
  RETAINER_STATUSES,
  RetainerSchema,
  RetainerUpdateSchema,
  type Retainer,
  type RetainerStatus,
} from '@/shared/contracts/retainers';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

interface RetainerActionResult {
  success: boolean;
  data?: Retainer;
  referenceCode?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function isRetainerStatus(value: string): value is RetainerStatus {
  return (RETAINER_STATUSES as readonly string[]).includes(value);
}

function normalizePage(page: number): number {
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizePageSize(pageSize: number): number {
  if (!Number.isFinite(pageSize) || pageSize < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
}

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
      const result = await createDefaultRetainerService().list({
        page: normalizePage(page),
        pageSize: normalizePageSize(pageSize),
        status: status && isRetainerStatus(status) ? status : undefined,
        search: search?.trim() || undefined,
      });
      return jsonResult(200, result);
    },
    { whenFailed: { success: false, error: 'تعذر تحميل العقود.' } }
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
      whenFailed: { success: false, error: 'تعذّر تحديث العقد.' },
    }
  );
}
