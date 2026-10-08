import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOWNLOAD_SETTINGS,
  type DownloadBlocklistEntry,
  type DownloadJob,
  type DownloadSettings,
  type DownloadStatus,
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
import { DownloaderAdminService } from '@/backend/services/downloader/downloader-admin-service';

function job(id: string, status: DownloadStatus, sourceUrl: string): DownloadJob {
  return {
    id,
    sourceUrl,
    format: 'audio',
    status,
    platform: null,
    error: null,
    file: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

class FakeJobs implements DownloadJobRepository {
  constructor(private readonly jobs: DownloadJob[]) {}

  async create(_input: CreateDownloadJobCommand): Promise<DownloadJob> {
    throw new Error('unused');
  }

  async findById(_id: string): Promise<DownloadJob | null> {
    return null;
  }

  async updateStatus(_id: string, _patch: DownloadJobUpdate): Promise<DownloadJob> {
    throw new Error('unused');
  }

  async countActive(): Promise<number> {
    return 0;
  }

  async list(query: DownloadJobListQuery): Promise<DownloadJobListResult> {
    const filtered = query.status
      ? this.jobs.filter((entry) => entry.status === query.status)
      : this.jobs;
    return { jobs: filtered, total: filtered.length };
  }
}

class FakePlatforms implements DownloadPlatformRepository {
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

class FakeBlocklist implements DownloadBlocklistRepository {
  readonly entries: DownloadBlocklistEntry[] = [];

  async list(): Promise<DownloadBlocklistEntry[]> {
    return [...this.entries];
  }

  async add(input: AddDownloadBlockCommand): Promise<DownloadBlocklistEntry> {
    const entry: DownloadBlocklistEntry = {
      id: `block-${this.entries.length + 1}`,
      kind: input.kind,
      value: input.value,
      createdAt: '2026-01-01T00:00:00.000Z',
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

class FakeSettings implements DownloadSettingsRepository {
  constructor(private current: DownloadSettings | null = null) {}

  async get(): Promise<DownloadSettings | null> {
    return this.current;
  }

  async save(settings: DownloadSettings): Promise<void> {
    this.current = settings;
  }
}

function makeService(
  overrides: {
    jobs?: DownloadJob[];
    platforms?: FakePlatforms;
    blocklist?: FakeBlocklist;
    settings?: FakeSettings;
    now?: () => Date;
  } = {}
) {
  const jobs = new FakeJobs(overrides.jobs ?? []);
  const platforms = overrides.platforms ?? new FakePlatforms();
  const blocklist = overrides.blocklist ?? new FakeBlocklist();
  const settings = overrides.settings ?? new FakeSettings();
  const service = new DownloaderAdminService(jobs, blocklist, platforms, settings, {
    now: overrides.now,
  });
  return { service, jobs, platforms, blocklist, settings };
}

describe('DownloaderAdminService.listJobs', () => {
  it('returns the page and the total from the repository', async () => {
    const { service } = makeService({
      jobs: [job('1', 'ready', 'https://a.com/1'), job('2', 'failed', 'https://b.com/2')],
    });

    const page = await service.listJobs({ page: 1, pageSize: 20, status: 'failed' });

    expect(page.total).toBe(1);
    expect(page.jobs.map((entry) => entry.id)).toEqual(['2']);
    expect(page).toMatchObject({ page: 1, pageSize: 20 });
  });
});

describe('DownloaderAdminService platforms', () => {
  it('reports the catalogue default when there is no override', async () => {
    const { service } = makeService();

    const platforms = await service.listPlatforms();
    const youtube = platforms.find((platform) => platform.id === 'youtube');

    expect(youtube).toMatchObject({ enabled: true, enabledByDefault: true, breakerOpen: false });
  });

  it('reflects a disabled override and an open breaker', async () => {
    const platforms = new FakePlatforms();
    await platforms.save('youtube', { enabled: false });
    await platforms.save('tiktok', { openUntil: '2031-01-01T00:00:00.000Z' });
    const { service } = makeService({
      platforms,
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });

    const list = await service.listPlatforms();
    expect(list.find((p) => p.id === 'youtube')?.enabled).toBe(false);
    expect(list.find((p) => p.id === 'tiktok')?.breakerOpen).toBe(true);
  });

  it('toggles a known Platform and rejects an unknown id', async () => {
    const { service, platforms } = makeService();

    const updated = await service.setPlatformEnabled('youtube', false);
    expect(updated).toMatchObject({ id: 'youtube', enabled: false });
    expect(platforms.states.get('youtube')?.enabled).toBe(false);

    expect(await service.setPlatformEnabled('nope', false)).toBeNull();
  });
});

describe('DownloaderAdminService settings', () => {
  it('falls back to the defaults when the row is absent', async () => {
    const { service } = makeService();

    await expect(service.getSettings()).resolves.toEqual(DEFAULT_DOWNLOAD_SETTINGS);
  });

  it('merges a patch into the current settings and saves it', async () => {
    const settings = new FakeSettings({ ...DEFAULT_DOWNLOAD_SETTINGS, maxConcurrentJobs: 20 });
    const { service } = makeService({ settings });

    const updated = await service.updateSettings({ maxConcurrentJobs: 5 });

    expect(updated.maxConcurrentJobs).toBe(5);
    expect(updated.maxDurationSeconds).toBe(DEFAULT_DOWNLOAD_SETTINGS.maxDurationSeconds);
    await expect(service.getSettings()).resolves.toMatchObject({ maxConcurrentJobs: 5 });
  });
});

describe('DownloaderAdminService blocklist', () => {
  it('adds, lists and removes entries', async () => {
    const { service } = makeService();

    const entry = await service.addBlock({
      kind: 'domain',
      value: 'example.com',
      createdBy: 'a@b.c',
    });
    await expect(service.listBlocklist()).resolves.toEqual([entry]);

    await service.removeBlock(entry.id);
    await expect(service.listBlocklist()).resolves.toEqual([]);
  });
});
