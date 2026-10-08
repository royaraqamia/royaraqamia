import * as Sentry from '@sentry/nextjs';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import {
  CreateDownloadJobSchema,
  DownloadCallbackSchema,
  type DownloadRequest,
} from '@/shared/contracts/downloader';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { zodFieldErrors } from '@/backend/shared/zod-field-errors';
import { runAfter } from '@/backend/config/after';
import { downloaderRateLimitPolicy } from '@/backend/config/rate-limiter';
import { env } from '@/backend/config/env';
import {
  createDownloaderService,
  createDownloaderTurnstileVerifier,
} from '@/backend/config/downloader';
import {
  BlockedLinkError,
  BLOCKED_LINK_MESSAGE,
  DownloadJobNotFoundError,
  PlatformUnavailableError,
  PLATFORM_BREAKER_MESSAGE,
  PLATFORM_DISABLED_MESSAGE,
} from '@/backend/services/downloader/downloader-service';

const DownloadJobIdSchema = z.string().uuid();

/**
 * Public and anonymous by design, like a training application or a consultation
 * booking, but a Download spends real provider CPU, so the create path is
 * gated: Turnstile (fail-closed, ADR-0019) and a fail-closed per-IP limit before
 * the job is accepted, then dispatched to the Media Provider after the response.
 * The global concurrency cap lives in the service.
 */
export async function createDownloadJob(body: unknown, ip: string): Promise<HttpResult> {
  const parsed = CreateDownloadJobSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      error: 'تحقق من الرابط والصيغة.',
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }

  const verifyTurnstile = createDownloaderTurnstileVerifier();
  if (!(await verifyTurnstile(parsed.data.turnstileToken ?? ''))) {
    return jsonResult(403, { success: false, error: 'فشل التحقّق الأمني. أعد المحاولة.' });
  }

  const rateLimited = await checkRateLimitApi({
    ...downloaderRateLimitPolicy(ip),
    failClosed: true,
  });
  if (rateLimited) return rateLimited;

  const request: DownloadRequest = { url: parsed.data.url, format: parsed.data.format };

  try {
    const service = createDownloaderService();
    const job = await service.create(request);

    runAfter(async () => {
      try {
        await service.dispatch(job.id, request);
      } catch (error) {
        Sentry.captureException(error);
      }
    });

    return jsonResult(202, { success: true, job });
  } catch (error) {
    if (error instanceof BlockedLinkError) {
      return jsonResult(403, { success: false, error: BLOCKED_LINK_MESSAGE });
    }
    if (error instanceof PlatformUnavailableError) {
      const message =
        error.reason === 'breaker' ? PLATFORM_BREAKER_MESSAGE : PLATFORM_DISABLED_MESSAGE;
      return jsonResult(403, { success: false, error: message });
    }
    Sentry.captureException(error);
    return jsonResult(500, { success: false, error: 'تعذّر بدء التنزيل.' });
  }
}

/**
 * Provider-only completion channel. The Media Provider POSTs the finished
 * Download here, authenticated by the shared callback secret; nothing public can
 * drive it (an unset secret rejects everything, fail-closed). The service then
 * moves the job to `ready` or `failed`, re-checking the caps.
 */
export async function recordDownloadCallback(body: unknown, headers: Headers): Promise<HttpResult> {
  const expected = env.downloaderCallbackSecret;
  const supplied = headers.get('x-downloader-callback-secret') ?? '';
  if (
    !expected ||
    supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  ) {
    return jsonResult(401, { success: false, error: 'غير مصرح' });
  }

  const parsed = DownloadCallbackSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, { success: false, error: 'بيانات غير صحيحة' });
  }

  try {
    await createDownloaderService().recordResult(parsed.data);
    return jsonResult(200, { success: true });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(500, { success: false, error: 'تعذّر تحديث حالة التنزيل.' });
  }
}

export async function getDownloadJob(id: string): Promise<HttpResult> {
  const parsedId = DownloadJobIdSchema.safeParse(id);
  if (!parsedId.success) {
    return jsonResult(400, { success: false, error: 'معرّف التنزيل غير صحيح.' });
  }

  try {
    const job = await createDownloaderService().get(parsedId.data);
    return jsonResult(200, { success: true, job });
  } catch (error) {
    if (error instanceof DownloadJobNotFoundError) {
      return jsonResult(404, { success: false, error: 'طلب التنزيل غير موجود.' });
    }
    Sentry.captureException(error);
    return jsonResult(500, { success: false, error: 'تعذّر تحميل حالة التنزيل.' });
  }
}
