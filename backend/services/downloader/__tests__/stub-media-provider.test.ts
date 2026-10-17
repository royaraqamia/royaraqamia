import { describe, expect, it } from 'vitest';
import {
  DownloadCallbackSchema,
  type DownloadJob,
  type DownloadStatus,
} from '@/shared/contracts/downloader';
import type {
  CreateDownloadJobCommand,
  DownloadJobListQuery,
  DownloadJobListResult,
  DownloadJobRepository,
  DownloadJobUpdate,
} from '@/backend/repositories/downloader/download-job-repository';
import { DownloaderService } from '@/backend/services/downloader/downloader-service';
import {
  StubMediaProvider,
  type StubMediaProviderDeps,
} from '@/backend/services/downloader/stub-media-provider';

const CALLBACK_URL = 'https://site.test/api/downloader/callback';
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST = { url: 'https://example.com/watch?v=1', format: 'video-720p' } as const;
const now = () => new Date('2026-01-01T00:00:00.000Z');

class InMemoryDownloadJobRepository implements DownloadJobRepository {
  private seq = 0;
  readonly jobs = new Map<string, DownloadJob>();

  async create(input: CreateDownloadJobCommand): Promise<DownloadJob> {
    // A v4-shaped id: `DownloadCallbackSchema` requires a uuid, and the stub
    // echoes the job id back on its callback.
    const id = `11111111-1111-4111-8111-${String(++this.seq).padStart(12, '0')}`;
    const at = now().toISOString();
    const job: DownloadJob = {
      id,
      sourceUrl: input.url,
      format: input.format,
      status: 'queued',
      platform: null,
      error: null,
      file: null,
      createdAt: at,
      updatedAt: at,
    };
    this.jobs.set(id, job);
    return job;
  }

  async findById(id: string): Promise<DownloadJob | null> {
    return this.jobs.get(id) ?? null;
  }

  async countActive(): Promise<number> {
    return [...this.jobs.values()].filter((job) => job.status === 'running').length;
  }

  async list(query: DownloadJobListQuery): Promise<DownloadJobListResult> {
    const jobs = [...this.jobs.values()].slice(0, query.pageSize);
    return { jobs, total: this.jobs.size };
  }

  async updateStatus(id: string, patch: DownloadJobUpdate): Promise<DownloadJob> {
    const previous = this.jobs.get(id);
    if (!previous) throw new Error(`missing job ${id}`);
    const status: DownloadStatus = patch.status;
    const next: DownloadJob = {
      ...previous,
      status,
      platform: patch.platform !== undefined ? patch.platform : previous.platform,
      error: patch.error !== undefined ? patch.error : previous.error,
      file: patch.file !== undefined ? patch.file : previous.file,
      updatedAt: now().toISOString(),
    };
    this.jobs.set(id, next);
    return next;
  }
}

/** A fetch stand-in that records the JSON body the stub posts. */
function capturingFetch(bodies: unknown[]): typeof fetch {
  return (async (_input: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return { ok: true, status: 200 } as unknown as Response;
  }) as typeof fetch;
}

function stub(deps: Partial<StubMediaProviderDeps> = {}): StubMediaProvider {
  return new StubMediaProvider({
    callbackUrl: CALLBACK_URL,
    callbackSecret: 'secret',
    now,
    ...deps,
  });
}

describe('StubMediaProvider.dispatch', () => {
  it('reports an absolute http(s) file link the callback schema accepts', async () => {
    const bodies: unknown[] = [];
    const provider = stub({ fetchImpl: capturingFetch(bodies) });

    await provider.dispatch({
      jobId: JOB_ID,
      url: REQUEST.url,
      format: REQUEST.format,
      callbackUrl: CALLBACK_URL,
      maxDurationSeconds: 900,
      maxSizeBytes: 200 * 1024 * 1024,
      linkTtlSeconds: 300,
    });

    // Before this, the stub sent a bare path — which the callback route answers
    // 400 to, leaving every stub-backed job stuck in `running`.
    const parsed = DownloadCallbackSchema.safeParse(bodies[0]);
    expect(parsed.success).toBe(true);
    if (!parsed.success || parsed.data.status !== 'ready') {
      throw new Error('expected a ready callback payload');
    }

    const file = new URL(parsed.data.file.url);
    expect(file.origin).toBe('https://site.test');
    expect(file.pathname).toBe('/downloader-sample.mp4');
    expect(file.searchParams.get('exp')).toBe('2026-01-01T00:05:00.000Z');
    expect(file.searchParams.get('sig')).toBe('stub');
  });

  it('drives a stub-backed Download Job to ready through its callback payload', async () => {
    const repository = new InMemoryDownloadJobRepository();
    // What the callback route does with the payload the stub sends.
    let deliver: (payload: unknown) => Promise<void> = async () => {};

    const provider = stub({
      fetchImpl: (async (_input: string | URL | Request, init?: RequestInit) => {
        await deliver(JSON.parse(String(init?.body)));
        return { ok: true, status: 200 } as unknown as Response;
      }) as typeof fetch,
    });
    const service = new DownloaderService(repository, provider, {
      callbackUrl: CALLBACK_URL,
      now,
    });
    deliver = async (payload) => {
      const parsed = DownloadCallbackSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
      if (parsed.success) await service.recordResult(parsed.data);
    };

    const created = await service.create(REQUEST);
    await service.dispatch(created.id, REQUEST);

    const job = await service.get(created.id);
    expect(job.status).toBe('ready');
    expect(new URL(job.file?.url ?? '').pathname).toBe('/downloader-sample.mp4');
  });

  it('refuses a non-http source link without reporting a result', async () => {
    const bodies: unknown[] = [];
    const provider = stub({ fetchImpl: capturingFetch(bodies) });

    await expect(
      provider.dispatch({
        jobId: JOB_ID,
        url: 'javascript:alert(1)',
        format: REQUEST.format,
        callbackUrl: CALLBACK_URL,
        maxDurationSeconds: 900,
        maxSizeBytes: 200 * 1024 * 1024,
        linkTtlSeconds: 300,
      })
    ).rejects.toThrow();

    expect(bodies).toHaveLength(0);
  });
});
