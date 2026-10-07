import { isHttpUrl, type DownloadJobFile } from '@/shared/contracts/downloader';
import {
  MediaProviderError,
  type MediaFetchInput,
  type MediaFetchResult,
  type MediaProvider,
} from './media-provider';

const MEDIA_TTL_MS = 5 * 60 * 1000;

/**
 * Tracer scaffolding (#150). The self-hosted Cobalt provider arrives in #151,
 * so the stub fabricates a provider-shaped, expiring link pointing at a bundled
 * sample file. It exercises the whole path — create, poll, download — without
 * the external host. Delete it once the Cobalt adapter is wired.
 */
export class StubMediaProvider implements MediaProvider {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async fetch({ url }: MediaFetchInput): Promise<MediaFetchResult> {
    if (!isHttpUrl(url)) {
      throw new MediaProviderError('هذا الرابط غير مدعوم.');
    }

    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const expiresAt = new Date(this.now().getTime() + MEDIA_TTL_MS).toISOString();

    const file: DownloadJobFile = {
      url: `/downloader-sample.mp4?exp=${encodeURIComponent(expiresAt)}&sig=stub`,
      filename: `royaraqamia-${hostname.replace(/[^a-z0-9]+/gi, '-')}.mp4`,
      sizeBytes: 0,
      expiresAt,
    };

    return { platform: hostname, durationSeconds: 0, file };
  }
}
