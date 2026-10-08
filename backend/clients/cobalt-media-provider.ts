import {
  MediaProviderError,
  type MediaDispatchInput,
  type MediaProvider,
} from '@/backend/services/downloader/media-provider';

export interface CobaltMediaProviderConfig {
  /** Base URL of the self-hosted Cobalt host (ADR-0017). */
  url: string;
  /** Shared token the host checks, sent as `Authorization: Bearer`. */
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * How long the app waits for the host to *acknowledge* a job (not to finish it).
 * Generous on purpose: a free host that sleeps between visits needs time to cold
 * start, and a late acknowledgement should delay a job rather than fail it. Keep
 * it under the create route's `maxDuration` so the `after()` dispatch can finish.
 */
const DEFAULT_TIMEOUT_MS = 55000;

/**
 * Adapter for the self-hosted Cobalt host that actually extracts and converts
 * media (ADR-0017). The app only hands over the job and a callback URL; the host
 * does the work off the request path and posts the result back to the signed
 * callback route. A non-2xx acknowledgement or an unreachable host becomes a
 * `MediaProviderError`, which the service records as a `failed` job, so the
 * visitor sees a reason instead of a job stuck at `running`.
 *
 * Wire contract (app → host): see docs/downloader-provider.md.
 */
export class CobaltMediaProvider implements MediaProvider {
  private readonly url: string;
  private readonly token?: string;
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;

  constructor(config: CobaltMediaProviderConfig) {
    this.url = config.url;
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetch = config.fetchImpl ?? fetch;
  }

  async dispatch(input: MediaDispatchInput): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          jobId: input.jobId,
          url: input.url,
          format: input.format,
          callbackUrl: input.callbackUrl,
          maxDurationSeconds: input.maxDurationSeconds,
          maxSizeBytes: input.maxSizeBytes,
          linkTtlSeconds: input.linkTtlSeconds,
        }),
        signal: controller.signal,
      });
    } catch {
      throw new MediaProviderError('خدمة التنزيل غير متاحة الآن.');
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 400 && response.status < 500) {
      throw new MediaProviderError('هذا الرابط غير مدعوم.');
    }
    if (!response.ok) {
      throw new MediaProviderError('خدمة التنزيل غير متاحة الآن.');
    }
  }
}
