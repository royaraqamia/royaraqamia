import {
  DOWNLOAD_FORMATS,
  MEDIA_KINDS,
  type DownloadFormat,
  type MediaKind,
  type ProbeFailureStatus,
  type ProbeResult,
} from '@/shared/contracts/downloader';
import {
  MediaProviderError,
  PROBE_FAILURE_MESSAGES,
  type MediaDispatchInput,
  type MediaInspectInput,
  type MediaProvider,
} from '@/backend/services/downloader/media-provider';

const downloadFormats: readonly string[] = DOWNLOAD_FORMATS;
const mediaKinds: readonly string[] = MEDIA_KINDS;
const probeFailureStatuses: readonly string[] = [
  'blocked',
  'unavailable',
  'unsupported',
  'unknown',
];

function isProbeFormat(
  value: unknown
): value is { format: DownloadFormat; filesizeBytes: number | null } {
  if (!value || typeof value !== 'object') return false;
  const format = (value as { format?: unknown }).format;
  const size = (value as { filesizeBytes?: unknown }).filesizeBytes;
  if (typeof format !== 'string' || !downloadFormats.includes(format)) return false;
  return size === null || (typeof size === 'number' && Number.isFinite(size));
}

export interface CobaltMediaProviderConfig {
  /** Base URL of the self-hosted Cobalt host (ADR-0017), the dispatch endpoint. */
  url: string;
  /** Shared token the host checks, sent as `Authorization: Bearer`. */
  token?: string;
  /** Per-attempt acknowledgement window. */
  timeoutMs?: number;
  /** How long a synchronous inspect/probe may take (the host runs yt-dlp -J). */
  inspectTimeoutMs?: number;
  /** Total attempts for a transient failure (network/abort/5xx). */
  attempts?: number;
  /** Base backoff between attempts; grows linearly with the attempt number. */
  backoffMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * How long a single attempt waits for the host to *acknowledge* a job (not to
 * finish it). A free host that sleeps between visits needs time to cold start, so
 * we make a few shorter attempts rather than one long one: the wake-up usually
 * lands within the total budget, and the app still answers within the create
 * route's `maxDuration`. Keep `attempts * timeoutMs + backoff` under that budget.
 */
const DEFAULT_TIMEOUT_MS = 16000;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 750;
/** A probe really runs the extractor, so it needs a longer single window. */
const DEFAULT_INSPECT_TIMEOUT_MS = 30000;

const UNAVAILABLE_MESSAGE = 'الخدمة غير متاحة مؤقتًا. حاول مجددًا بعد لحظات.';
const UNSUPPORTED_MESSAGE = 'هذا الرابط غير مدعوم.';

/** A failure worth retrying (host still cold, transient 5xx) vs. a decision. */
class TransientDispatchError extends MediaProviderError {
  constructor() {
    super(UNAVAILABLE_MESSAGE);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Adapter for the self-hosted Cobalt host that actually extracts and converts
 * media (ADR-0017). The app only hands over the job and a callback URL; the host
 * does the work off the request path and posts the result back to the signed
 * callback route. A transient acknowledgement failure (unreachable host, cold
 * start, 5xx) is retried a few times before becoming a `MediaProviderError`, so a
 * blip delays a job instead of failing it. The host dedupes by `jobId`, so a
 * retried dispatch never runs a job twice.
 *
 * Wire contract (app → host): see docs/downloader-provider.md.
 */
export class CobaltMediaProvider implements MediaProvider {
  private readonly url: string;
  private readonly token?: string;
  private readonly timeoutMs: number;
  private readonly inspectTimeoutMs: number;
  private readonly attempts: number;
  private readonly backoffMs: number;
  private readonly fetch: typeof fetch;

  constructor(config: CobaltMediaProviderConfig) {
    this.url = config.url;
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.inspectTimeoutMs = config.inspectTimeoutMs ?? DEFAULT_INSPECT_TIMEOUT_MS;
    this.attempts = Math.max(1, config.attempts ?? DEFAULT_ATTEMPTS);
    this.backoffMs = config.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.fetch = config.fetchImpl ?? fetch;
  }

  async dispatch(input: MediaDispatchInput): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.dispatchOnce(input);
        return;
      } catch (error) {
        const retryable = error instanceof TransientDispatchError;
        if (!retryable || attempt >= this.attempts) {
          throw error instanceof MediaProviderError
            ? error
            : new MediaProviderError(UNAVAILABLE_MESSAGE);
        }
        await sleep(this.backoffMs * attempt);
      }
    }
  }

  private async dispatchOnce(input: MediaDispatchInput): Promise<void> {
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
      throw new TransientDispatchError();
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 400 && response.status < 500) {
      throw new MediaProviderError(UNSUPPORTED_MESSAGE);
    }
    if (!response.ok) {
      throw new TransientDispatchError();
    }
  }

  /** The host's probe endpoint, derived from the dispatch URL. */
  private probeUrl(): string {
    if (/\/dispatch\/?$/.test(this.url)) {
      return this.url.replace(/\/dispatch\/?$/, '/probe');
    }
    return `${this.url.replace(/\/$/, '')}/probe`;
  }

  async inspect({ url }: MediaInspectInput): Promise<ProbeResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.inspectTimeoutMs);

    let response: Response;
    try {
      response = await this.fetch(this.probeUrl(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
    } catch {
      throw new MediaProviderError(UNAVAILABLE_MESSAGE);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw new MediaProviderError(UNAVAILABLE_MESSAGE);

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new MediaProviderError(UNAVAILABLE_MESSAGE);
    }
    return this.parseProbe(data);
  }

  /** Shape the host's probe payload, discarding anything malformed. */
  private parseProbe(data: unknown): ProbeResult {
    const payload = (data ?? {}) as Record<string, unknown>;
    if (payload.status !== 'ok') {
      const raw = typeof payload.status === 'string' ? payload.status : 'unknown';
      const status = (probeFailureStatuses.includes(raw) ? raw : 'unknown') as ProbeFailureStatus;
      return { status, message: PROBE_FAILURE_MESSAGES[status] };
    }

    if (!mediaKinds.includes(String(payload.mediaType))) {
      return { status: 'unknown', message: PROBE_FAILURE_MESSAGES.unknown };
    }
    const formats = Array.isArray(payload.formats) ? payload.formats.filter(isProbeFormat) : [];

    return {
      status: 'ok',
      platform: typeof payload.platform === 'string' ? payload.platform : null,
      platformName: null,
      mediaType: payload.mediaType as MediaKind,
      title: typeof payload.title === 'string' ? payload.title : null,
      durationSeconds: typeof payload.durationSeconds === 'number' ? payload.durationSeconds : null,
      thumbnailUrl: typeof payload.thumbnailUrl === 'string' ? payload.thumbnailUrl : null,
      formats,
    };
  }
}
