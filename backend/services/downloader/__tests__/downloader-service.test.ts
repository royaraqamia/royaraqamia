import { describe, expect, it } from 'vitest';
import {
  MAX_DOWNLOAD_DURATION_SECONDS,
  MAX_DOWNLOAD_VIDEO_BYTES,
  type DownloadCallback,
  type DownloadJob,
  type DownloadStatus,
} from '@/shared/contracts/downloader';
import type {
  CreateDownloadJobCommand,
  DownloadJobRepository,
  DownloadJobUpdate,
} from '@/backend/repositories/downloader/download-job-repository';
import {
  MediaProviderError,
  type MediaDispatchInput,
  type MediaProvider,
} from '@/backend/services/downloader/media-provider';
import {
  DownloaderService,
  DownloadJobNotFoundError,
  type DownloaderServiceDeps,
} from '@/backend/services/downloader/downloader-service';

class InMemoryDownloadJobRepository implements DownloadJobRepository {
  private seq = 0;
  readonly jobs = new Map<string, DownloadJob>();
  readonly events: { id: string; status: DownloadStatus }[] = [];

  async create(input: CreateDownloadJobCommand): Promise<DownloadJob> {
    const id = `job-${++this.seq}`;
    const now = new Date().toISOString();
    const job: DownloadJob = {
      id,
      sourceUrl: input.url,
      format: input.format,
      status: 'queued',
      platform: null,
      error: null,
      file: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job);
    this.events.push({ id, status: 'queued' });
    return job;
  }

  async findById(id: string): Promise<DownloadJob | null> {
    return this.jobs.get(id) ?? null;
  }

  async countActive(): Promise<number> {
    return [...this.jobs.values()].filter((job) => job.status === 'running').length;
  }

  async updateStatus(id: string, patch: DownloadJobUpdate): Promise<DownloadJob> {
    const prev = this.jobs.get(id);
    if (!prev) throw new Error(`missing job ${id}`);

    const next: DownloadJob = {
      ...prev,
      status: patch.status,
      platform: patch.platform !== undefined ? patch.platform : prev.platform,
      error: patch.error !== undefined ? patch.error : prev.error,
      file: patch.file !== undefined ? patch.file : prev.file,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, next);
    this.events.push({ id, status: patch.status });
    return next;
  }
}

class FakeProvider implements MediaProvider {
  readonly calls: MediaDispatchInput[] = [];

  constructor(private readonly outcome: Error | null = null) {}

  async dispatch(input: MediaDispatchInput): Promise<void> {
    this.calls.push(input);
    if (this.outcome) throw this.outcome;
  }
}

const INPUT = { url: 'https://example.com/v/1', format: 'video-720p' } as const;

type ReadyCallback = Extract<DownloadCallback, { status: 'ready' }>;

function readyCallback(jobId: string): ReadyCallback {
  return {
    jobId,
    status: 'ready',
    platform: 'example.com',
    durationSeconds: 120,
    file: {
      url: 'https://media.example.com/x.mp4',
      filename: 'x.mp4',
      sizeBytes: 1234,
      expiresAt: '2030-01-01T00:00:00.000Z',
    },
  };
}

function makeService(deps: DownloaderServiceDeps = {}, provider = new FakeProvider()) {
  const repository = new InMemoryDownloadJobRepository();
  const service = new DownloaderService(repository, provider, deps);
  return { repository, service, provider };
}

describe('DownloaderService.create', () => {
  it('accepts the request as a queued job without touching the provider', async () => {
    const { repository, service, provider } = makeService();

    const job = await service.create(INPUT);

    expect(job.status).toBe('queued');
    expect(job.file).toBeNull();
    expect(provider.calls).toHaveLength(0);
    expect(repository.events.map((event) => event.status)).toEqual(['queued']);
  });
});

describe('DownloaderService.dispatch', () => {
  it('marks the job running and hands the provider a signed callback target', async () => {
    const { service, provider } = makeService({ callbackUrl: 'https://site.test/cb' });
    const created = await service.create(INPUT);

    await service.dispatch(created.id, INPUT);

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toMatchObject({
      jobId: created.id,
      url: INPUT.url,
      format: INPUT.format,
      callbackUrl: 'https://site.test/cb',
      maxDurationSeconds: MAX_DOWNLOAD_DURATION_SECONDS,
      maxSizeBytes: MAX_DOWNLOAD_VIDEO_BYTES,
    });
    const job = await service.get(created.id);
    expect(job.status).toBe('running');
  });

  it('records a provider-declared failure as a failed job rather than throwing', async () => {
    const { repository, service } = makeService(
      {},
      new FakeProvider(new MediaProviderError('هذا الرابط غير مدعوم.'))
    );
    const created = await service.create(INPUT);

    await service.dispatch(created.id, INPUT);

    const job = await service.get(created.id);
    expect(job.status).toBe('failed');
    expect(job.error).toBe('هذا الرابط غير مدعوم.');
    expect(repository.events.map((event) => event.status)).toEqual(['queued', 'running', 'failed']);
  });

  it('hides an unexpected dispatch error behind a generic reason', async () => {
    const { service } = makeService({}, new FakeProvider(new Error('boom')));
    const created = await service.create(INPUT);

    await service.dispatch(created.id, INPUT);

    const job = await service.get(created.id);
    expect(job.status).toBe('failed');
    expect(job.error).not.toContain('boom');
  });

  it('refuses a new job with a busy reason once the concurrency cap is reached', async () => {
    const { service, provider } = makeService({ capacityLimit: 1 });
    const first = await service.create(INPUT);
    await service.dispatch(first.id, INPUT);

    const second = await service.create(INPUT);
    await service.dispatch(second.id, INPUT);

    expect(provider.calls).toHaveLength(1);
    const job = await service.get(second.id);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('مزدحمة');
  });
});

describe('DownloaderService.recordResult', () => {
  it('completes a running job with the provider link', async () => {
    const { repository, service } = makeService();
    const created = await service.create(INPUT);
    await service.dispatch(created.id, INPUT);

    await service.recordResult(readyCallback(created.id));

    const job = await service.get(created.id);
    expect(job.status).toBe('ready');
    expect(job.platform).toBe('example.com');
    expect(job.file).toEqual(readyCallback(created.id).file);
    expect(repository.events.map((event) => event.status)).toEqual(['queued', 'running', 'ready']);
  });

  it('records a provider failure with the provider reason', async () => {
    const { service } = makeService();
    const created = await service.create(INPUT);
    await service.dispatch(created.id, INPUT);

    await service.recordResult({
      jobId: created.id,
      status: 'failed',
      error: 'هذا الرابط خاص أو محميّ.',
    });

    const job = await service.get(created.id);
    expect(job.status).toBe('failed');
    expect(job.error).toBe('هذا الرابط خاص أو محميّ.');
  });

  it('rejects a result past the duration cap even if the provider ignores it', async () => {
    const { service } = makeService();
    const created = await service.create(INPUT);
    await service.dispatch(created.id, INPUT);

    await service.recordResult({
      ...readyCallback(created.id),
      durationSeconds: MAX_DOWNLOAD_DURATION_SECONDS + 1,
    });

    const job = await service.get(created.id);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('مدة الوسائط');
  });

  it('rejects a result past the size cap even if the provider ignores it', async () => {
    const { service } = makeService();
    const created = await service.create(INPUT);
    await service.dispatch(created.id, INPUT);

    const callback = readyCallback(created.id);
    await service.recordResult({
      ...callback,
      file: { ...callback.file, sizeBytes: MAX_DOWNLOAD_VIDEO_BYTES + 1 },
    });

    const job = await service.get(created.id);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('حجم');
  });

  it('ignores a result for an unknown job', async () => {
    const { repository, service } = makeService();

    await expect(
      service.recordResult(readyCallback('00000000-0000-0000-0000-000000000000'))
    ).resolves.toBeUndefined();
    expect(repository.events).toHaveLength(0);
  });

  it('ignores a result once the job is already terminal', async () => {
    const { service } = makeService();
    const created = await service.create(INPUT);
    await service.dispatch(created.id, INPUT);
    await service.recordResult(readyCallback(created.id));

    await service.recordResult({
      jobId: created.id,
      status: 'failed',
      error: 'too late',
    });

    const job = await service.get(created.id);
    expect(job.status).toBe('ready');
  });
});

describe('DownloaderService.get', () => {
  it('throws DownloadJobNotFoundError for an unknown id', async () => {
    const { service } = makeService();

    await expect(service.get('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      DownloadJobNotFoundError
    );
  });

  it('expires a ready link once it has passed its lifetime and drops the link', async () => {
    const { repository, service } = makeService();
    const created = await service.create(INPUT);
    await service.dispatch(created.id, INPUT);
    await service.recordResult(readyCallback(created.id));

    const later = new DownloaderService(repository, new FakeProvider(), {
      now: () => new Date('2031-01-01T00:00:00.000Z'),
    });

    const job = await later.get(created.id);
    expect(job.status).toBe('expired');
    expect(job.file).toBeNull();
    expect(repository.events.map((event) => event.status)).toContain('expired');
  });
});
