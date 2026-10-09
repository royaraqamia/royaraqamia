import { isHttpUrl, type ProbeResult } from '@/shared/contracts/downloader';
import {
  MediaProviderError,
  type MediaDispatchInput,
  type MediaInspectInput,
  type MediaProvider,
} from '@/backend/services/downloader/media-provider';

export interface StubMediaProviderDeps {
  /** The app callback route the stub reports to, exactly as the real host would. */
  callbackUrl: string;
  callbackSecret?: string;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

/**
 * Tracer scaffolding (#150/#151). The self-hosted Cobalt host arrives with a real
 * always-on deployment; until it does, this stands in for it. It behaves like the
 * host: it acknowledges the dispatch and then POSTs a fabricated, expiring link
 * back to the signed callback route, so the whole out-of-band path — dispatch,
 * callback auth, job completion — is exercised without the external service.
 * Delete it once the Cobalt host is live.
 */
export class StubMediaProvider implements MediaProvider {
  private readonly callbackUrl: string;
  private readonly callbackSecret: string;
  private readonly now: () => Date;
  private readonly fetch: typeof fetch;

  constructor(deps: StubMediaProviderDeps) {
    this.callbackUrl = deps.callbackUrl;
    this.callbackSecret = deps.callbackSecret ?? '';
    this.now = deps.now ?? (() => new Date());
    this.fetch = deps.fetchImpl ?? fetch;
  }

  async dispatch({ jobId, url, linkTtlSeconds }: MediaDispatchInput): Promise<void> {
    if (!isHttpUrl(url)) {
      throw new MediaProviderError('هذا الرَّابط غير مدعوم.');
    }

    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const expiresAt = new Date(this.now().getTime() + linkTtlSeconds * 1000).toISOString();

    const body = {
      jobId,
      status: 'ready',
      platform: hostname,
      durationSeconds: 0,
      file: {
        url: `/downloader-sample.mp4?exp=${encodeURIComponent(expiresAt)}&sig=stub`,
        filename: `royaraqamia-${hostname.replace(/[^a-z0-9]+/gi, '-')}.mp4`,
        sizeBytes: 0,
        expiresAt,
      },
    };

    try {
      await this.fetch(this.callbackUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-downloader-callback-secret': this.callbackSecret,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new MediaProviderError('تعذّر إكمال التنزيل.');
    }
  }

  /**
   * A canned probe so the inspect path is exercised locally without the host.
   * Reports a video with the two formats the stub can plausibly produce.
   */
  async inspect({ url }: MediaInspectInput): Promise<ProbeResult> {
    if (!isHttpUrl(url)) {
      throw new MediaProviderError('هذا الرَّابط غير مدعوم.');
    }
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return {
      status: 'ok',
      platform: hostname,
      platformName: null,
      mediaType: 'video',
      title: `royaraqamia-${hostname.replace(/[^a-z0-9]+/gi, '-')}`,
      durationSeconds: 0,
      thumbnailUrl: null,
      formats: [
        { format: 'video-720p', filesizeBytes: null },
        { format: 'audio', filesizeBytes: null },
      ],
    };
  }
}
