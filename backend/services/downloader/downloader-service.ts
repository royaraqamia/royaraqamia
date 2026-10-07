import {
  MAX_DOWNLOAD_DURATION_SECONDS,
  TERMINAL_DOWNLOAD_STATUSES,
  maxDownloadBytes,
  type DownloadCallback,
  type DownloadJob,
  type DownloadRequest,
} from '@/shared/contracts/downloader';
import type { DownloadJobRepository } from '@/backend/repositories/downloader/download-job-repository';
import {
  MediaProviderError,
  type MediaProvider,
} from '@/backend/services/downloader/media-provider';

const BUSY_MESSAGE = 'الخدمة مزدحمة حاليًّا. حاول مجددًا بعد قليل.';
const DURATION_MESSAGE = 'مدة الوسائط تتجاوز الحدّ المسموح (15 دقيقة).';
const SIZE_MESSAGE = 'حجم الملف يتجاوز الحدّ المسموح.';
const GENERIC_FAILURE = 'تعذّر تنزيل الوسائط من هذا الرابط.';

export class DownloadJobNotFoundError extends Error {
  constructor() {
    super('Download job not found.');
    this.name = 'DownloadJobNotFoundError';
  }
}

export interface DownloaderServiceDeps {
  now?: () => Date;
  /** Global cap on jobs running at the provider at once; omitted means unbounded. */
  capacityLimit?: number;
  /** The signed callback route the Media Provider reports to. */
  callbackUrl?: string;
}

/**
 * Owns one Download Job's short life. `create` accepts the request as `queued`;
 * `dispatch` hands it to the Media Provider (marking it `running`); the provider
 * finishes off the request path and POSTs back, which `recordResult` turns into
 * the terminal `ready` or `failed`. Until Cobalt is live (#151) the stub provider
 * drives that callback itself, so the out-of-band path is the only path.
 *
 * The duration and size caps are re-checked here when the result arrives, so a
 * provider that ignores the limits it was handed still cannot record a file past
 * them. The concurrency cap counts jobs already in flight at the provider.
 */
export class DownloaderService {
  private readonly now: () => Date;
  private readonly capacityLimit: number | undefined;
  private readonly callbackUrl: string;

  constructor(
    private readonly repository: DownloadJobRepository,
    private readonly provider: MediaProvider,
    deps: DownloaderServiceDeps = {}
  ) {
    this.now = deps.now ?? (() => new Date());
    this.capacityLimit = deps.capacityLimit;
    this.callbackUrl = deps.callbackUrl ?? '';
  }

  async create(request: DownloadRequest): Promise<DownloadJob> {
    return this.repository.create({ url: request.url, format: request.format });
  }

  async dispatch(id: string, request: DownloadRequest): Promise<void> {
    if (
      this.capacityLimit !== undefined &&
      (await this.repository.countActive()) >= this.capacityLimit
    ) {
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
        maxDurationSeconds: MAX_DOWNLOAD_DURATION_SECONDS,
        maxSizeBytes: maxDownloadBytes(request.format),
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
      return;
    }

    if (callback.durationSeconds > MAX_DOWNLOAD_DURATION_SECONDS) {
      await this.repository.updateStatus(job.id, { status: 'failed', error: DURATION_MESSAGE });
      return;
    }
    if (callback.file.sizeBytes > maxDownloadBytes(job.format)) {
      await this.repository.updateStatus(job.id, { status: 'failed', error: SIZE_MESSAGE });
      return;
    }

    await this.repository.updateStatus(job.id, {
      status: 'ready',
      platform: callback.platform ?? null,
      file: callback.file,
    });
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
