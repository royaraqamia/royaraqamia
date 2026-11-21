import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockInfo = vi.fn();

vi.mock('@/backend/shared/logger', () => ({
  logger: { info: (...args: unknown[]) => mockInfo(...args), warn: vi.fn(), error: vi.fn() },
}));

import { env } from '@/backend/config/env';
import {
  buildBootReport,
  buildMemorySample,
  createBootStore,
  noteBoot,
  startMemoryTrace,
  type BootFacts,
  type BootRecord,
  type BootStore,
} from '@/backend/shared/runtime-watch';

const FACTS: BootFacts = {
  release: '1.149.4+build.7.39c0f873',
  commit: '39c0f8734e36aa63fe6015d46c5004f9d76268ed',
  instance: 'srv-dbr26rm7bikc73fklqag-m6jkf',
  pid: 82,
  node: 'v22.22.2',
  rssBytes: 96 * 1024 * 1024,
  heapLimitBytes: 384 * 1024 * 1024,
};

const NOW = Date.parse('2026-11-16T09:00:00Z');

function fakeStore(previous: BootRecord | null): BootStore & { written: BootRecord[] } {
  const written: BootRecord[] = [];
  return {
    read: async () => previous,
    write: async (record) => {
      written.push(record);
    },
    written,
  };
}

describe('buildBootReport', () => {
  it('dates the gap from the previous boot', () => {
    const previous = { commit: FACTS.commit, startedAt: '2026-11-16T06:30:00Z' };

    expect(buildBootReport(FACTS, previous, NOW)).toEqual({
      release: FACTS.release,
      commit: FACTS.commit,
      instance: FACTS.instance,
      pid: 82,
      node: 'v22.22.2',
      rssMb: 96,
      heapLimitMb: 384,
      previousBootAt: '2026-11-16T06:30:00Z',
      sincePreviousBootMs: 2.5 * 60 * 60 * 1000,
      sameCommitAsPreviousBoot: true,
    });
  });

  it('marks a boot that followed a new deploy', () => {
    const previous = { commit: 'older-sha', startedAt: '2026-11-16T06:30:00Z' };

    expect(buildBootReport(FACTS, previous, NOW).sameCommitAsPreviousBoot).toBe(false);
  });

  it('reports no gap on the first boot the store has seen', () => {
    const report = buildBootReport(FACTS, null, NOW);

    expect(report.previousBootAt).toBeNull();
    expect(report.sincePreviousBootMs).toBeNull();
    expect(report.sameCommitAsPreviousBoot).toBeNull();
    expect(report.heapLimitMb).toBe(384);
  });

  it('refuses a gap a broken record would invent', () => {
    const unreadable = { commit: FACTS.commit, startedAt: 'not a date' };
    const future = { commit: FACTS.commit, startedAt: '2026-11-16T10:00:00Z' };

    expect(buildBootReport(FACTS, unreadable, NOW).sincePreviousBootMs).toBeNull();
    expect(buildBootReport(FACTS, future, NOW).sincePreviousBootMs).toBeNull();
    expect(buildBootReport(FACTS, unreadable, NOW).previousBootAt).toBeNull();
  });
});

describe('buildMemorySample', () => {
  it('reports megabytes against the heap the process actually has', () => {
    const sample = buildMemorySample(
      {
        rss: 512 * 1024 * 1024,
        heapTotal: 300 * 1024 * 1024,
        heapUsed: 123.4 * 1024 * 1024,
        external: 12 * 1024 * 1024,
        arrayBuffers: 8 * 1024 * 1024,
      } as NodeJS.MemoryUsage,
      384 * 1024 * 1024,
      5 * 60 + 40
    );

    expect(sample).toEqual({
      rssMb: 512,
      heapUsedMb: 123,
      heapTotalMb: 300,
      heapLimitMb: 384,
      externalMb: 12,
      arrayBuffersMb: 8,
      remainderMb: 200,
      uptimeMin: 5,
    });
  });
});

describe('noteBoot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs one boot line and records the start for the next boot', async () => {
    const store = fakeStore({ commit: 'older', startedAt: '2026-11-16T08:55:00Z' });

    const report = await noteBoot({ store, now: () => NOW });

    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledWith('[boot]', report);
    expect(report.commit).toBe(env.version);
    expect(report.sincePreviousBootMs).toBe(5 * 60 * 1000);

    await Promise.resolve();
    expect(store.written).toEqual([{ commit: env.version, startedAt: '2026-11-16T09:00:00.000Z' }]);
  });

  it('boots without a store, with the gap fields empty rather than wrong', async () => {
    const report = await noteBoot({ store: null, now: () => NOW });

    expect(report.previousBootAt).toBeNull();
    expect(report.sincePreviousBootMs).toBeNull();
    expect(mockInfo).toHaveBeenCalledWith('[boot]', report);
  });

  it('survives a store that cannot answer', async () => {
    const store: BootStore = {
      read: async () => {
        throw new Error('upstash is down');
      },
      write: async () => {
        throw new Error('upstash is down');
      },
    };

    await expect(noteBoot({ store, now: () => NOW })).resolves.toMatchObject({
      previousBootAt: null,
    });
    expect(mockInfo).toHaveBeenCalledTimes(1);
  });
});

describe('createBootStore', () => {
  it('is absent until both halves of the credential are configured', () => {
    expect(createBootStore({})).toBeNull();
    expect(createBootStore({ url: 'https://example.upstash.io' })).toBeNull();
    expect(createBootStore({ token: 'token' })).toBeNull();
    expect(createBootStore({ url: 'https://example.upstash.io', token: 'token' })).not.toBeNull();
  });
});

describe('startMemoryTrace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes a sample per interval, and only one trace per process', () => {
    startMemoryTrace(1000);
    startMemoryTrace(1000);

    vi.advanceTimersByTime(3000);

    expect(mockInfo).toHaveBeenCalledTimes(3);
    expect(mockInfo).toHaveBeenCalledWith(
      '[memory]',
      expect.objectContaining({ rssMb: expect.any(Number) })
    );
  });
});
