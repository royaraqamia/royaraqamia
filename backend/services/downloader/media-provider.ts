import type { DownloadFormat } from '@/shared/contracts/downloader';

/** A Download the app asks the Media Provider to process, with where to report back. */
export interface MediaDispatchInput {
  jobId: string;
  url: string;
  format: DownloadFormat;
  /** The app's signed callback route the provider POSTs the result to. */
  callbackUrl: string;
  /** Caps the provider must honour, mirrored from the server-side limits. */
  maxDurationSeconds: number;
  maxSizeBytes: number;
}

/**
 * The extraction/transcoding backend the Media Downloader delegates to. The app
 * never converts media itself (ADR-0017); it depends on this port so the
 * self-hosted Cobalt host and any future fallback are interchangeable.
 *
 * Dispatching is asynchronous: the provider acknowledges the job, does the work
 * off the request path, then POSTs the result to `callbackUrl` (the app owns the
 * Download Job in between). A provider that never calls back leaves the job
 * `running` until the retention sweep reconciles it (#155).
 */
export interface MediaProvider {
  dispatch(input: MediaDispatchInput): Promise<void>;
}

/** A failure the provider can explain to the visitor; anything else is unknown. */
export class MediaProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaProviderError';
  }
}
