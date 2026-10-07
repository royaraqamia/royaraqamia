import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { CreateDownloadJobSchema } from '@/shared/contracts/downloader';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { zodFieldErrors } from '@/backend/shared/zod-field-errors';
import { runAfter } from '@/backend/config/after';
import { createDownloaderService } from '@/backend/config/downloader';
import { DownloadJobNotFoundError } from '@/backend/services/downloader/downloader-service';

const DownloadJobIdSchema = z.string().uuid();

/**
 * Public and anonymous by design, like a training application or a consultation
 * booking. Abuse controls (Turnstile, per-IP limit, caps) land in #153; #150 is
 * the tracer that proves the path.
 *
 * The job is accepted synchronously and processed after the response
 * (`runAfter`), so the client sees a real `queued → running → ready` by polling.
 */
export async function createDownloadJob(body: unknown): Promise<HttpResult> {
  const parsed = CreateDownloadJobSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      error: 'تحقق من الرابط والصيغة.',
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }

  try {
    const service = createDownloaderService();
    const job = await service.create(parsed.data);

    runAfter(async () => {
      try {
        await service.process(job.id, parsed.data);
      } catch (error) {
        Sentry.captureException(error);
      }
    });

    return jsonResult(202, { success: true, job });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(500, { success: false, error: 'تعذّر بدء التنزيل.' });
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
