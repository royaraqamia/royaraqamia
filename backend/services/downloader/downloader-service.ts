import {
  DEFAULT_DOWNLOAD_SETTINGS,
  TERMINAL_DOWNLOAD_STATUSES,
  maxDownloadBytes,
  type DownloadCallback,
  type DownloadJob,
  type DownloadRequest,
  type DownloadSettings,
  type ProbeResult,
} from '@/shared/contracts/downloader';
import type { DownloadJobRepository } from '@/backend/repositories/downloader/download-job-repository';
import type { DownloadPlatformRepository } from '@/backend/repositories/downloader/download-platform-repository';
import type { DownloadBlocklistRepository } from '@/backend/repositories/downloader/download-blocklist-repository';
import type { DownloadSettingsRepository } from '@/backend/repositories/downloader/download-settings-repository';
import {
  MediaProviderError,
  PROBE_FAILURE_MESSAGES,
  type MediaProvider,
} from '@/backend/services/downloader/media-provider';
import { isUrlBlocked } from '@/backend/services/downloader/blocklist';
import { platformForUrl } from '@/backend/services/downloader/platform-catalog';

const BUSY_MESSAGE = 'الخدمة مزدحمة حاليًّا. حاول مجددًا بعد قليل.';
const SIZE_MESSAGE = 'حجم الملف يتجاوز الحدّ المسموح.';
const GENERIC_FAILURE = 'تعذّر تنزيل الوسائط من هذا الرَّابط.';

export const BLOCKED_LINK_MESSAGE = 'هذا الرَّابط محظور.';
export const PLATFORM_DISABLED_MESSAGE = 'هذا الموقع غير مدعوم حاليًّا.';
export const PLATFORM_BREAKER_MESSAGE = 'هذا الموقع غير متاح مؤقتًا. حاول مجددًا بعد قليل.';

function durationMessage(maxDurationSeconds: number): string {
  const minutes = Math.max(1, Math.round(maxDurationSeconds / 60));
  return `مدة الوسائط تتجاوز الحدّ المسموح (${minutes} دقيقة).`;
}

export class DownloadJobNotFoundError extends Error {
  constructor() {
    super('Download job not found.');
    this.name = 'DownloadJobNotFoundError';
  }
}

/** A Platform the allowlist or its circuit breaker refuses right now. */
export class PlatformUnavailableError extends Error {
  constructor(readonly reason: 'disabled' | 'breaker') {
    super(reason === 'disabled' ? 'Platform disabled.' : 'Platform circuit breaker open.');
    this.name = 'PlatformUnavailableError';
  }
}

/** A source link the Admin blocklist refuses. */
export class BlockedLinkError extends Error {
  constructor() {
    super('Source link is blocked.');
    this.name = 'BlockedLinkError';
  }
}

/** Consecutive failures before a Platform's breaker opens, and for how long. */
export interface PlatformBreakerPolicy {
  failureThreshold: number;
  cooldownMs: number;
}

export interface BreakerTrip {
  platform: string;
  failures: number;
  openUntil: string;
}

export interface DownloaderServiceDeps {
  now?: () => Date;
  /** The signed callback route the Media Provider reports to. */
  callbackUrl?: string;
  /** Per-Platform allowlist overrides and breaker state; omitted means catalogue defaults only. */
  platforms?: DownloadPlatformRepository;
  /** Breaker policy; omitted means the breaker never trips. */
  breaker?: PlatformBreakerPolicy;
  /** Called when a Platform's breaker opens, so the edge can report it (Sentry). */
  onBreakerTrip?: (trip: BreakerTrip) => void;
  /** Live caps an Admin can tune; omitted means `DEFAULT_DOWNLOAD_SETTINGS`. */
  settings?: DownloadSettingsRepository;
  /** Admin blocklist; omitted means no link is refused. */
  blocklist?: DownloadBlocklistRepository;
}

/**
 * Owns one Download Job's short life. `create` accepts the request as `queued`;
 * `dispatch` hands it to the Media Provider (marking it `running`); the provider
 * finishes off the request path and POSTs back, which `recordResult` turns into
 * the terminal `ready` or `failed`.
 *
 * The duration and size caps are re-checked here when the result arrives, so a
 * provider that ignores the limits it was handed still cannot record a file past
 * them. Every limit is read from the tunable settings row, so an Admin change
 * takes effect without a deploy. The concurrency cap counts jobs already in
 * flight at the provider. A known Platform is refused at `create` when the
 * allowlist disables it or its circuit breaker is open, a blocked link is refused
 * before any work, and provider failures are counted per Platform so a repeatedly
 * failing extractor opens that breaker (ADR-0020).
 */
export class DownloaderService {
  private readonly now: () => Date;
  private readonly callbackUrl: string;
  private readonly platforms: DownloadPlatformRepository | undefined;
  private readonly breaker: PlatformBreakerPolicy | undefined;
  private readonly onBreakerTrip: ((trip: BreakerTrip) => void) | undefined;
  private readonly settings: DownloadSettingsRepository | undefined;
  private readonly blocklist: DownloadBlocklistRepository | undefined;

  constructor(
    private readonly repository: DownloadJobRepository,
    private readonly provider: MediaProvider,
    deps: DownloaderServiceDeps = {}
  ) {
    this.now = deps.now ?? (() => new Date());
    this.callbackUrl = deps.callbackUrl ?? '';
    this.platforms = deps.platforms;
    this.breaker = deps.breaker;
    this.onBreakerTrip = deps.onBreakerTrip;
    this.settings = deps.settings;
    this.blocklist = deps.blocklist;
  }

  async create(request: DownloadRequest): Promise<DownloadJob> {
    await this.assertNotBlocked(request.url);
    await this.assertPlatformAvailable(request.url);
    return this.repository.create({ url: request.url, format: request.format });
  }

  /**
   * Inspect a link before any download: a blocklisted link or an unavailable
   * Platform is reported the same way `create` refuses it, then the provider is
   * asked what formats are on offer. Every refusal is a shaped result rather
   * than a throw, so the UI can always render a reason. A provider/transport
   * failure is `unknown` — the link is not blamed for the host being down.
   */
  async inspect(url: string): Promise<ProbeResult> {
    const platform = platformForUrl(url);
    try {
      await this.assertNotBlocked(url);
      await this.assertPlatformAvailable(url);
    } catch (error) {
      if (error instanceof BlockedLinkError) {
        return { status: 'unsupported', message: BLOCKED_LINK_MESSAGE };
      }
      if (error instanceof PlatformUnavailableError) {
        return error.reason === 'breaker'
          ? { status: 'blocked', message: PLATFORM_BREAKER_MESSAGE }
          : { status: 'unsupported', message: PLATFORM_DISABLED_MESSAGE };
      }
      throw error;
    }

    try {
      const result = await this.provider.inspect({ url });
      return result.status === 'ok' ? { ...result, platformName: platform?.name ?? null } : result;
    } catch {
      return { status: 'unknown', message: PROBE_FAILURE_MESSAGES.unknown };
    }
  }

  async dispatch(id: string, request: DownloadRequest): Promise<void> {
    const settings = await this.effectiveSettings();
    if ((await this.repository.countActive()) >= settings.maxConcurrentJobs) {
      await this.repository.updateStatus(id, { status: 'failed', error: BUSY_MESSAGE });
      return;
    }

    await this.repository.updateStatus(id, { status: 'running' });

    try {
      await this.provider.dispatch({
        jobId: id,
        url: request.url,
        format: request.format,
        callbackUrl: this.callbackUrl,
        maxDurationSeconds: settings.maxDurationSeconds,
        maxSizeBytes: maxDownloadBytes(request.format, settings),
        linkTtlSeconds: settings.linkTtlSeconds,
      });
    } catch (error) {
      const reason = error instanceof MediaProviderError ? error.message : GENERIC_FAILURE;
      await this.repository.updateStatus(id, { status: 'failed', error: reason });
    }
  }

  async recordResult(callback: DownloadCallback): Promise<void> {
    const job = await this.repository.findById(callback.jobId);
    if (!job || TERMINAL_DOWNLOAD_STATUSES.includes(job.status)) return;

    if (callback.status === 'failed') {
      await this.repository.updateStatus(job.id, { status: 'failed', error: callback.error });
      await this.recordPlatformFailure(job.sourceUrl);
      return;
    }

    const settings = await this.effectiveSettings();
    if (callback.durationSeconds > settings.maxDurationSeconds) {
      await this.repository.updateStatus(job.id, {
        status: 'failed',
        error: durationMessage(settings.maxDurationSeconds),
      });
      return;
    }
    if (callback.file.sizeBytes > maxDownloadBytes(job.format, settings)) {
      await this.repository.updateStatus(job.id, { status: 'failed', error: SIZE_MESSAGE });
      return;
    }

    await this.repository.updateStatus(job.id, {
      status: 'ready',
      platform: callback.platform ?? null,
      file: callback.file,
    });
    await this.recordPlatformSuccess(job.sourceUrl);
  }

  /** The live caps, falling back to the defaults when no row or repo is wired. */
  private async effectiveSettings(): Promise<DownloadSettings> {
    if (!this.settings) return DEFAULT_DOWNLOAD_SETTINGS;
    return (await this.settings.get()) ?? DEFAULT_DOWNLOAD_SETTINGS;
  }

  /** Refuse a link the Admin blocklist bans before any provider work. */
  private async assertNotBlocked(url: string): Promise<void> {
    if (!this.blocklist) return;
    const entries = await this.blocklist.list();
    if (isUrlBlocked(url, entries)) throw new BlockedLinkError();
  }

  /**
   * Refuse a job the allowlist or a Platform's breaker will not accept. Only a
   * known Platform can be refused; a generic host is always attempted (ADR-0020).
   */
  private async assertPlatformAvailable(url: string): Promise<void> {
    const platform = platformForUrl(url);
    if (!platform || !this.platforms) return;

    const state = await this.platforms.get(platform.id);
    const enabled = state?.enabled ?? platform.enabledByDefault;
    if (!enabled) throw new PlatformUnavailableError('disabled');
    if (state?.openUntil && new Date(state.openUntil) > this.now()) {
      throw new PlatformUnavailableError('breaker');
    }
  }

  /**
   * Count a provider-declared failure against the Platform and open its breaker
   * once the threshold is reached. Bookkeeping failures never fail the callback —
   * the job is already terminal — so a broken counter cannot mask a result.
   */
  private async recordPlatformFailure(url: string): Promise<void> {
    const platform = platformForUrl(url);
    if (!platform || !this.platforms || !this.breaker) return;

    try {
      const now = this.now();
      const state = await this.platforms.get(platform.id);
      if (state?.openUntil && new Date(state.openUntil) > now) return;

      const failures = (state?.consecutiveFailures ?? 0) + 1;
      if (failures >= this.breaker.failureThreshold) {
        const openUntil = new Date(now.getTime() + this.breaker.cooldownMs).toISOString();
        await this.platforms.save(platform.id, {
          consecutiveFailures: 0,
          openUntil,
          lastFailureAt: now.toISOString(),
        });
        this.onBreakerTrip?.({ platform: platform.id, failures, openUntil });
        return;
      }

      await this.platforms.save(platform.id, {
        consecutiveFailures: failures,
        lastFailureAt: now.toISOString(),
      });
    } catch {
      // Never let breaker bookkeeping fail the callback.
    }
  }

  private async recordPlatformSuccess(url: string): Promise<void> {
    const platform = platformForUrl(url);
    if (!platform || !this.platforms) return;

    try {
      const state = await this.platforms.get(platform.id);
      if (!state || (state.consecutiveFailures === 0 && state.openUntil === null)) return;
      await this.platforms.save(platform.id, { consecutiveFailures: 0, openUntil: null });
    } catch {
      // Never let breaker bookkeeping fail the callback.
    }
  }

  async get(id: string): Promise<DownloadJob> {
    const job = await this.repository.findById(id);
    if (!job) throw new DownloadJobNotFoundError();

    if (job.status === 'ready' && job.file && new Date(job.file.expiresAt) <= this.now()) {
      return this.repository.updateStatus(job.id, { status: 'expired', file: null });
    }
    return job;
  }
}
