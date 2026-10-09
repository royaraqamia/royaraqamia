import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOWNLOAD_SETTINGS,
  MAX_DOWNLOAD_DURATION_SECONDS,
  MAX_DOWNLOAD_VIDEO_BYTES,
  type DownloadBlocklistEntry,
  type DownloadCallback,
  type DownloadJob,
  type DownloadSettings,
  type DownloadStatus,
  type ProbeResult,
} from '@/shared/contracts/downloader';
import type {
  CreateDownloadJobCommand,
  DownloadJobListQuery,
  DownloadJobListResult,
  DownloadJobRepository,
  DownloadJobUpdate,
} from '@/backend/repositories/downloader/download-job-repository';
import type {
  DownloadPlatformPatch,
  DownloadPlatformRepository,
  DownloadPlatformState,
} from '@/backend/repositories/downloader/download-platform-repository';
import type {
  AddDownloadBlockCommand,
  DownloadBlocklistRepository,
} from '@/backend/repositories/downloader/download-blocklist-repository';
import type { DownloadSettingsRepository } from '@/backend/repositories/downloader/download-settings-repository';
import {
  MediaProviderError,
  type MediaDispatchInput,
  type MediaInspectInput,
  type MediaProvider,
} from '@/backend/services/downloader/media-provider';
import {
  BlockedLinkError,
  DownloaderService,
  DownloadJobNotFoundError,
  PlatformUnavailableError,
  type BreakerTrip,
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

  async list(query: DownloadJobListQuery): Promise<DownloadJobListResult> {
    const filtered = [...this.jobs.values()].filter((job) => {
      if (query.status && job.status !== query.status) return false;
      if (query.search && !job.sourceUrl.includes(query.search)) return false;
      return true;
    });
    const start = (query.page - 1) * query.pageSize;
    return {
      jobs: filtered.slice(start, start + query.pageSize),
      total: filtered.length,
    };
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
  readonly inspectCalls: string[] = [];
  inspectResult: ProbeResult = {
    status: 'ok',
    platform: 'example.com',
    platformName: null,
    mediaType: 'video',
    title: null,
    durationSeconds: 0,
    thumbnailUrl: null,
    formats: [],
  };

  constructor(private readonly outcome: Error | null = null) {}

  async dispatch(input: MediaDispatchInput): Promise<void> {
    this.calls.push(input);
    if (this.outcome) throw this.outcome;
  }

  async inspect(input: MediaInspectInput): Promise<ProbeResult> {
    this.inspectCalls.push(input.url);
    if (this.outcome) throw this.outcome;
    return this.inspectResult;
  }
}

class InMemoryDownloadPlatformRepository implements DownloadPlatformRepository {
  readonly states = new Map<string, DownloadPlatformState>();

  async get(platform: string): Promise<DownloadPlatformState | null> {
    return this.states.get(platform) ?? null;
  }

  async save(platform: string, patch: DownloadPlatformPatch): Promise<void> {
    const previous = this.states.get(platform) ?? {
      platform,
      enabled: null,
      consecutiveFailures: 0,
      openUntil: null,
      lastFailureAt: null,
    };
    this.states.set(platform, { ...previous, ...patch, platform });
  }
}

class InMemoryDownloadBlocklistRepository implements DownloadBlocklistRepository {
  readonly entries: DownloadBlocklistEntry[] = [];

  async list(): Promise<DownloadBlocklistEntry[]> {
    return [...this.entries];
  }

  async add(input: AddDownloadBlockCommand): Promise<DownloadBlocklistEntry> {
    const entry: DownloadBlocklistEntry = {
      id: `block-${this.entries.length + 1}`,
      kind: input.kind,
      value: input.value,
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy,
    };
    this.entries.push(entry);
    return entry;
  }

  async remove(id: string): Promise<void> {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index >= 0) this.entries.splice(index, 1);
  }
}

class InMemoryDownloadSettingsRepository implements DownloadSettingsRepository {
  constructor(private current: DownloadSettings | null = null) {}

  async get(): Promise<DownloadSettings | null> {
    return this.current;
  }

  async save(settings: DownloadSettings): Promise<void> {
    this.current = settings;
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

describe('DownloaderService.inspect', () => {
  it('returns the provider result and fills the platform name from the catalog', async () => {
    const provider = new FakeProvider();
    provider.inspectResult = {
      status: 'ok',
      platform: 'youtube.com',
      platformName: null,
      mediaType: 'video',
      title: 't',
      durationSeconds: 1,
      thumbnailUrl: null,
      formats: [{ format: 'video-720p', filesizeBytes: 100 }],
    };
    const { service } = makeService({}, provider);

    const result = await service.inspect('https://youtube.com/watch?v=abc');

    expect(provider.inspectCalls).toEqual(['https://youtube.com/watch?v=abc']);
    expect(result).toMatchObject({ status: 'ok', platformName: 'YouTube' });
  });

  it('reports a provider/transport failure as unknown rather than blaming the link', async () => {
    const provider = new FakeProvider(new MediaProviderError('host down'));
    const { service } = makeService({}, provider);

    const result = await service.inspect(INPUT.url);

    expect(result.status).toBe('unknown');
    expect(result).toHaveProperty('message');
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
      new FakeProvider(new MediaProviderError('هذا الرَّابط غير مدعوم.'))
    );
    const created = await service.create(INPUT);

    await service.dispatch(created.id, INPUT);

    const job = await service.get(created.id);
    expect(job.status).toBe('failed');
    expect(job.error).toBe('هذا الرَّابط غير مدعوم.');
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
    const settings = new InMemoryDownloadSettingsRepository({
      ...DEFAULT_DOWNLOAD_SETTINGS,
      maxConcurrentJobs: 1,
    });
    const { service, provider } = makeService({ settings });
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
      error: 'هذا الرَّابط خاص أو محميّ.',
    });

    const job = await service.get(created.id);
    expect(job.status).toBe('failed');
    expect(job.error).toBe('هذا الرَّابط خاص أو محميّ.');
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

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=abc123';
const YOUTUBE_INPUT = { url: YOUTUBE_URL, format: 'audio' } as const;

describe('DownloaderService platform allowlist', () => {
  it('refuses a Platform the allowlist disables', async () => {
    const platforms = new InMemoryDownloadPlatformRepository();
    await platforms.save('youtube', { enabled: false });
    const { service } = makeService({ platforms });

    await expect(service.create(YOUTUBE_INPUT)).rejects.toBeInstanceOf(PlatformUnavailableError);
  });

  it('refuses a Platform whose circuit breaker is open', async () => {
    const platforms = new InMemoryDownloadPlatformRepository();
    await platforms.save('youtube', { openUntil: '2031-01-01T00:00:00.000Z' });
    const { service } = makeService({
      platforms,
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });

    await expect(service.create(YOUTUBE_INPUT)).rejects.toMatchObject({ reason: 'breaker' });
  });

  it('accepts a Platform once its breaker has closed', async () => {
    const platforms = new InMemoryDownloadPlatformRepository();
    await platforms.save('youtube', { openUntil: '2029-01-01T00:00:00.000Z' });
    const { service } = makeService({
      platforms,
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });

    await expect(service.create(YOUTUBE_INPUT)).resolves.toMatchObject({ status: 'queued' });
  });

  it('attempts an unknown host best-effort and records no state for it', async () => {
    const platforms = new InMemoryDownloadPlatformRepository();
    const { service } = makeService({ platforms });

    await expect(service.create(INPUT)).resolves.toMatchObject({ status: 'queued' });
    expect(platforms.states.size).toBe(0);
  });
});

describe('DownloaderService platform circuit breaker', () => {
  const policy = { failureThreshold: 3, cooldownMs: 60_000 };

  async function failOnce(service: DownloaderService) {
    const created = await service.create(YOUTUBE_INPUT);
    await service.dispatch(created.id, YOUTUBE_INPUT);
    await service.recordResult({ jobId: created.id, status: 'failed', error: 'تعذّر التنزيل.' });
  }

  it('counts consecutive failures without opening below the threshold', async () => {
    const platforms = new InMemoryDownloadPlatformRepository();
    const trips: BreakerTrip[] = [];
    const { service } = makeService({
      platforms,
      breaker: policy,
      onBreakerTrip: (trip) => trips.push(trip),
    });

    await failOnce(service);

    expect(platforms.states.get('youtube')?.consecutiveFailures).toBe(1);
    expect(platforms.states.get('youtube')?.openUntil).toBeNull();
    expect(trips).toHaveLength(0);
  });

  it('opens the breaker at the threshold, resets the counter and reports the trip', async () => {
    const platforms = new InMemoryDownloadPlatformRepository();
    const trips: BreakerTrip[] = [];
    const { service } = makeService({
      platforms,
      breaker: policy,
      onBreakerTrip: (trip) => trips.push(trip),
    });

    await failOnce(service);
    await failOnce(service);
    await failOnce(service);

    const state = platforms.states.get('youtube');
    expect(state?.consecutiveFailures).toBe(0);
    expect(state?.openUntil).not.toBeNull();
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ platform: 'youtube', failures: 3 });
  });

  it('resets the counter and closes the breaker when a job succeeds', async () => {
    const platforms = new InMemoryDownloadPlatformRepository();
    const { service } = makeService({ platforms, breaker: policy });
    await platforms.save('youtube', {
      consecutiveFailures: 2,
      openUntil: '2020-01-01T00:00:00.000Z',
    });

    const created = await service.create(YOUTUBE_INPUT);
    await service.dispatch(created.id, YOUTUBE_INPUT);
    await service.recordResult(readyCallback(created.id));

    expect(platforms.states.get('youtube')).toMatchObject({
      consecutiveFailures: 0,
      openUntil: null,
    });
  });
});

describe('DownloaderService blocklist', () => {
  it('refuses a blocked link before creating a job', async () => {
    const blocklist = new InMemoryDownloadBlocklistRepository();
    await blocklist.add({ kind: 'domain', value: 'example.com', createdBy: null });
    const { repository, service } = makeService({ blocklist });

    await expect(service.create(INPUT)).rejects.toBeInstanceOf(BlockedLinkError);
    expect(repository.jobs.size).toBe(0);
  });

  it('accepts a link when the blocklist is empty', async () => {
    const blocklist = new InMemoryDownloadBlocklistRepository();
    const { service } = makeService({ blocklist });

    await expect(service.create(INPUT)).resolves.toMatchObject({ status: 'queued' });
  });
});

describe('DownloaderService tunable settings', () => {
  it('hands the provider the live caps and link TTL', async () => {
    const settings = new InMemoryDownloadSettingsRepository({
      maxDurationSeconds: 60,
      maxAudioBytes: 1024,
      maxVideoBytes: 2048,
      maxConcurrentJobs: 20,
      linkTtlSeconds: 45,
    });
    const { service, provider } = makeService({ settings });
    const created = await service.create(INPUT);

    await service.dispatch(created.id, INPUT);

    expect(provider.calls[0]).toMatchObject({
      maxDurationSeconds: 60,
      maxSizeBytes: 2048,
      linkTtlSeconds: 45,
    });
  });

  it('rejects a result past the tuned duration cap', async () => {
    const settings = new InMemoryDownloadSettingsRepository({
      ...DEFAULT_DOWNLOAD_SETTINGS,
      maxDurationSeconds: 60,
    });
    const { service } = makeService({ settings });
    const created = await service.create(INPUT);
    await service.dispatch(created.id, INPUT);

    await service.recordResult({ ...readyCallback(created.id), durationSeconds: 61 });

    const job = await service.get(created.id);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('1 دقيقة');
  });
});
