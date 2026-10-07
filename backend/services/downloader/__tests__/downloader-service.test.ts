import { describe, expect, it } from 'vitest';
import {
  MAX_DOWNLOAD_DURATION_SECONDS,
  MAX_DOWNLOAD_VIDEO_BYTES,
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
  type MediaFetchResult,
  type MediaProvider,
} from '@/backend/services/downloader/media-provider';
import {
  DownloaderService,
  DownloadJobNotFoundError,
  type DownloaderServiceDeps,
} from '@/backend/services/downloader/downloader-service';
import type { ConcurrencyGate, SlotReleaser } from '@/backend/clients/concurrency-gate';

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

class StubProvider implements MediaProvider {
  constructor(private readonly outcome: MediaFetchResult | Error) {}

  async fetch(): Promise<MediaFetchResult> {
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

const INPUT = { url: 'https://example.com/v/1', format: 'video-720p' } as const;

const READY_RESULT: MediaFetchResult = {
  platform: 'example.com',
  durationSeconds: 120,
  file: {
    url: 'https://media.example.com/x.mp4',
    filename: 'x.mp4',
    sizeBytes: 1234,
    expiresAt: '2030-01-01T00:00:00.000Z',
  },
};

class StubGate implements ConcurrencyGate {
  releaseCalls = 0;

  constructor(private readonly available: boolean) {}

  async acquire(): Promise<SlotReleaser | null> {
    if (!this.available) return null;
    return async () => {
      this.releaseCalls += 1;
    };
  }
}

function makeService(outcome: MediaFetchResult | Error, deps: DownloaderServiceDeps = {}) {
  const repository = new InMemoryDownloadJobRepository();
  const service = new DownloaderService(repository, new StubProvider(outcome), deps);
  return { repository, service };
}

describe('DownloaderService.create', () => {
  it('accepts the request as a queued job without touching the provider', async () => {
    const { repository, service } = makeService(new Error('provider must not run'));

    const job = await service.create(INPUT);

    expect(job.status).toBe('queued');
    expect(job.file).toBeNull();
    expect(repository.events.map((event) => event.status)).toEqual(['queued']);
  });
});

describe('DownloaderService.process', () => {
  it('moves a job queued → running → ready and records every transition', async () => {
    const { repository, service } = makeService(READY_RESULT);
    const created = await service.create(INPUT);

    await service.process(created.id, INPUT);

    const job = await service.get(created.id);
    expect(job.status).toBe('ready');
    expect(job.platform).toBe('example.com');
    expect(job.file).toEqual(READY_RESULT.file);
    expect(repository.events.map((event) => event.status)).toEqual(['queued', 'running', 'ready']);
  });

  it('records a failed job with the provider reason instead of throwing', async () => {
    const { repository, service } = makeService(new MediaProviderError('هذا الرابط غير مدعوم.'));
    const created = await service.create(INPUT);

    await service.process(created.id, INPUT);

    const job = await service.get(created.id);
    expect(job.status).toBe('failed');
    expect(job.error).toBe('هذا الرابط غير مدعوم.');
    expect(repository.events.map((event) => event.status)).toEqual(['queued', 'running', 'failed']);
  });

  it('hides an unexpected provider error behind a generic reason', async () => {
    const { service } = makeService(new Error('boom'));
    const created = await service.create(INPUT);

    await service.process(created.id, INPUT);

    const job = await service.get(created.id);
    expect(job.status).toBe('failed');
    expect(job.error).not.toContain('boom');
  });

  it('fails a job whose file exceeds the size cap', async () => {
    const oversized: MediaFetchResult = {
      ...READY_RESULT,
      file: { ...READY_RESULT.file, sizeBytes: MAX_DOWNLOAD_VIDEO_BYTES + 1 },
    };
    const { service } = makeService(oversized);
    const created = await service.create(INPUT);

    await service.process(created.id, INPUT);

    const job = await service.get(created.id);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('حجم');
  });

  it('fails a job whose duration exceeds the cap', async () => {
    const tooLong: MediaFetchResult = {
      ...READY_RESULT,
      durationSeconds: MAX_DOWNLOAD_DURATION_SECONDS + 1,
    };
    const { service } = makeService(tooLong);
    const created = await service.create(INPUT);

    await service.process(created.id, INPUT);

    const job = await service.get(created.id);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('مدة الوسائط');
  });

  it('fails with a busy reason when the capacity gate is full', async () => {
    const { service } = makeService(READY_RESULT, { capacity: new StubGate(false) });
    const created = await service.create(INPUT);

    await service.process(created.id, INPUT);

    const job = await service.get(created.id);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('مزدحمة');
  });

  it('releases its capacity slot after processing', async () => {
    const gate = new StubGate(true);
    const { service } = makeService(READY_RESULT, { capacity: gate });
    const created = await service.create(INPUT);

    await service.process(created.id, INPUT);

    expect(gate.releaseCalls).toBe(1);
  });
});

describe('DownloaderService.get', () => {
  it('throws DownloadJobNotFoundError for an unknown id', async () => {
    const { service } = makeService(READY_RESULT);

    await expect(service.get('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      DownloadJobNotFoundError
    );
  });

  it('records an expired transition once a ready link has passed its lifetime', async () => {
    const { repository, service } = makeService(READY_RESULT);
    const created = await service.create(INPUT);
    await service.process(created.id, INPUT);

    const later = new DownloaderService(repository, new StubProvider(READY_RESULT), {
      now: () => new Date('2031-01-01T00:00:00.000Z'),
    });

    const job = await later.get(created.id);
    expect(job.status).toBe('expired');
    expect(job.file).toBeNull();
    expect(repository.events.map((event) => event.status)).toContain('expired');
  });
});
