import * as Sentry from '@sentry/nextjs';
import type { z } from 'zod';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { createDefaultProjectRequestService } from '@/backend/config/project-requests';
import { ProjectRequestRateLimitError } from '@/backend/services/project-requests/project-requests-service';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { ProjectRequestSchema } from '@/shared/contracts/project-requests';

interface ProjectRequestActionResult {
  success: boolean;
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

/**
 * Public and unauthenticated by design: a prospective Client is the coldest
 * audience on the site and requiring an account would cost the lead. Protected
 * by a per-IP rate limit. A signed-in visitor is attributed opportunistically
 * when a session happens to exist.
 */
export async function submitProjectRequest(body: unknown, ip: string): Promise<HttpResult> {
  const parsed = ProjectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      error: 'تحقق من الحقول المدخلة.',
      fieldErrors: zodFieldErrors(parsed.error),
    } satisfies ProjectRequestActionResult);
  }

  try {
    const { user } = await getOptionalUser();
    const request = await createDefaultProjectRequestService().submit(parsed.data, {
      ip,
      userId: user?.id ?? null,
    });

    return jsonResult(200, {
      success: true,
      referenceCode: request.reference_code,
    } satisfies ProjectRequestActionResult);
  } catch (error) {
    Sentry.captureException(error);

    if (error instanceof ProjectRequestRateLimitError) {
      return jsonResult(429, {
        success: false,
        error: error.message,
      } satisfies ProjectRequestActionResult);
    }

    return jsonResult(500, {
      success: false,
      error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
    } satisfies ProjectRequestActionResult);
  }
}
