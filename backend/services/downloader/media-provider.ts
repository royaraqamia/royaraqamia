import type { DownloadFormat, DownloadJobFile } from '@/shared/contracts/downloader';

export interface MediaFetchInput {
  url: string;
  format: DownloadFormat;
  /** Caps the provider must honour, mirrored from the server-side limits. */
  maxDurationSeconds: number;
  maxSizeBytes: number;
}

/** What a Media Provider hands back once a Download is ready. */
export interface MediaFetchResult {
  platform: string | null;
  durationSeconds: number;
  file: DownloadJobFile;
}

/**
 * The extraction/transcoding backend the Media Downloader delegates to. The
 * app never converts media itself (ADR-0017); it depends on this port so the
 * self-hosted Cobalt adapter and the hosted fallback are interchangeable.
 */
export interface MediaProvider {
  fetch(input: MediaFetchInput): Promise<MediaFetchResult>;
}

/** A failure the provider can explain to the visitor; anything else is unknown. */
export class MediaProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaProviderError';
  }
}
