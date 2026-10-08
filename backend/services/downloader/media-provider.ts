import type {
  DownloadFormat,
  ProbeFailureStatus,
  ProbeResult,
} from '@/shared/contracts/downloader';

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
  /** How long the provider's signed file link should stay valid. */
  linkTtlSeconds: number;
}

/** A link the app asks the provider to inspect before committing to a download. */
export interface MediaInspectInput {
  url: string;
}

/**
 * Visitor-facing copy for the reasons a probe can come back empty-handed. Lives
 * next to the port so every provider reports the same words for the same reason.
 */
export const PROBE_FAILURE_MESSAGES: Record<ProbeFailureStatus, string> = {
  blocked: 'المحتوى محجوب عن خادم التنزيل حاليًّا. جرّب رابطًا آخر أو أعد المحاولة لاحقًا.',
  unavailable: 'هذا المحتوى غير متاح.',
  unsupported: 'هذا الرابط غير مدعوم.',
  unknown: 'تعذّر فحص الرابط. تأكّد من صحّته وحاول مجددًا.',
};

/**
 * The extraction/transcoding backend the Media Downloader delegates to. The app
 * never converts media itself (ADR-0017); it depends on this port so the
 * self-hosted Cobalt host and any future fallback are interchangeable.
 *
 * Dispatching is asynchronous: the provider acknowledges the job, does the work
 * off the request path, then POSTs the result to `callbackUrl` (the app owns the
 * Download Job in between). A provider that never calls back leaves the job
 * `running` until the retention sweep reconciles it (#155).
 *
 * `inspect` is the synchronous counterpart: a cheap pre-download probe that says
 * what a link is, which formats are on offer, and roughly how big each is. A
 * probe that cannot reach the host throws `MediaProviderError`; a probe that
 * succeeds but finds nothing usable returns a `ProbeFailure` instead.
 */
export interface MediaProvider {
  dispatch(input: MediaDispatchInput): Promise<void>;
  inspect(input: MediaInspectInput): Promise<ProbeResult>;
}

/** A failure the provider can explain to the visitor; anything else is unknown. */
export class MediaProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaProviderError';
  }
}
