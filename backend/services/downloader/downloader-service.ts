import {
  MAX_DOWNLOAD_DURATION_SECONDS,
  maxDownloadBytes,
  type DownloadJob,
  type DownloadRequest,
} from '@/shared/contracts/downloader';
import type { ConcurrencyGate } from '@/backend/clients/concurrency-gate';
import type { DownloadJobRepository } from '@/backend/repositories/downloader/download-job-repository';
import {
  MediaProviderError,
  type MediaProvider,
} from '@/backend/services/downloader/media-provider';

const BUSY_MESSAGE = 'الخدمة مزدحمة حاليًّا. حاول مجددًا بعد قليل.';

export class DownloadJobNotFoundError extends Error {
  constructor() {
    super('Download job not found.');
    this.name = 'DownloadJobNotFoundError';
  }
}

/** A Download that the provider did deliver, but past a cap we enforce ourselves. */
class DownloadLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadLimitError';
  }
}

export interface DownloaderServiceDeps {
  now?: () => Date;
  /** Global cap on simultaneous provider jobs; omitted means unbounded. */
  capacity?: ConcurrencyGate;
}

/**
 * Runs one Download through its short life. `create` accepts the request and
 * returns a `queued` job; `process` is scheduled after the response and moves it
 * through `running` to `ready` (or `failed`), recording each transition through
 * the repository. Until the Cobalt provider calls back (#151), `process` is the
 * thing that advances a job.
 *
 * The duration and size caps are enforced here as well as being handed to the
 * provider, so a provider that ignores them still cannot deliver past the limit.
 * A slot from the capacity gate wraps the provider call, bounding how many
 * Downloads run at once across the whole site.
 */
export class DownloaderService {
  private readonly now: () => Date;
  private readonly capacity: ConcurrencyGate | undefined;

  constructor(
    private readonly repository: DownloadJobRepository,
    private readonly provider: MediaProvider,
    deps: DownloaderServiceDeps = {}
  ) {
    this.now = deps.now ?? (() => new Date());
    this.capacity = deps.capacity;
  }

  async create(request: DownloadRequest): Promise<DownloadJob> {
    return this.repository.create({ url: request.url, format: request.format });
  }

  async process(id: string, request: DownloadRequest): Promise<void> {
    const release = this.capacity ? await this.capacity.acquire() : null;
    if (this.capacity && !release) {
      await this.repository.updateStatus(id, { status: 'failed', error: BUSY_MESSAGE });
      return;
    }

    try {
      await this.repository.updateStatus(id, { status: 'running' });

      const maxSizeBytes = maxDownloadBytes(request.format);
      const result = await this.provider.fetch({
        url: request.url,
        format: request.format,
        maxDurationSeconds: MAX_DOWNLOAD_DURATION_SECONDS,
        maxSizeBytes,
      });

      if (result.durationSeconds > MAX_DOWNLOAD_DURATION_SECONDS) {
        throw new DownloadLimitError('مدة الوسائط تتجاوز الحدّ المسموح (15 دقيقة).');
      }
      if (result.file.sizeBytes > maxSizeBytes) {
        throw new DownloadLimitError('حجم الملف يتجاوز الحدّ المسموح.');
      }

      await this.repository.updateStatus(id, {
        status: 'ready',
        platform: result.platform,
        file: result.file,
      });
    } catch (error) {
      const reason =
        error instanceof DownloadLimitError || error instanceof MediaProviderError
          ? error.message
          : 'تعذّر تنزيل الوسائط من هذا الرابط.';
      await this.repository.updateStatus(id, { status: 'failed', error: reason });
    } finally {
      if (release) await release();
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
