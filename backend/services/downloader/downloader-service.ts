import type { CreateDownloadJobInput, DownloadJob } from '@/shared/contracts/downloader';
import type { DownloadJobRepository } from '@/backend/repositories/downloader/download-job-repository';
import {
  MediaProviderError,
  type MediaProvider,
} from '@/backend/services/downloader/media-provider';

export class DownloadJobNotFoundError extends Error {
  constructor() {
    super('Download job not found.');
    this.name = 'DownloadJobNotFoundError';
  }
}

/**
 * Runs one Download through its short life. `create` accepts the request and
 * returns a `queued` job; `process` is scheduled after the response and moves it
 * through `running` to `ready` (or `failed`), recording each transition through
 * the repository. Until the Cobalt provider calls back (#151), `process` is the
 * thing that advances a job.
 */
export class DownloaderService {
  constructor(
    private readonly repository: DownloadJobRepository,
    private readonly provider: MediaProvider,
    private readonly now: () => Date = () => new Date()
  ) {}

  async create(input: CreateDownloadJobInput): Promise<DownloadJob> {
    return this.repository.create({ url: input.url, format: input.format });
  }

  async process(id: string, input: CreateDownloadJobInput): Promise<void> {
    await this.repository.updateStatus(id, { status: 'running' });

    try {
      const result = await this.provider.fetch({ url: input.url, format: input.format });
      await this.repository.updateStatus(id, {
        status: 'ready',
        platform: result.platform,
        file: result.file,
      });
    } catch (error) {
      const reason =
        error instanceof MediaProviderError ? error.message : 'تعذّر تنزيل الوسائط من هذا الرابط.';
      await this.repository.updateStatus(id, { status: 'failed', error: reason });
    }
  }

  async get(id: string): Promise<DownloadJob> {
    const job = await this.repository.findById(id);
    if (!job) throw new DownloadJobNotFoundError();

    if (job.status === 'ready' && job.file && new Date(job.file.expiresAt) <= this.now()) {
      return this.repository.updateStatus(job.id, { status: 'expired' });
    }
    return job;
  }
}
