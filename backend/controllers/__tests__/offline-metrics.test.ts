import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockCheckRateLimitApi = vi.fn();
const mockInfo = vi.fn();
const mockCaptureMessage = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}));
vi.mock('@/backend/middleware/http', () => ({
  checkRateLimitApi: (config: unknown) => mockCheckRateLimitApi(config),
}));
vi.mock('@/backend/shared/logger', () => ({
  logger: { info: (...args: unknown[]) => mockInfo(...args), warn: vi.fn(), error: vi.fn() },
}));

import { recordOfflineServe } from '@/backend/controllers/offline-metrics';

const IP = '1.2.3.4';
const REPORT = {
  version: 1,
  door: 'navigation-deadline',
  cache: { hits: 4, misses: 2, failures: 1 },
};

describe('recordOfflineServe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimitApi.mockResolvedValue(null);
  });

  it('writes the door class and the tallies as one log line', async () => {
    const result = await recordOfflineServe(REPORT, IP);

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(mockInfo).toHaveBeenCalledWith('[offline-serve]', {
      version: 1,
      door: 'navigation-deadline',
      cache: { hits: 4, misses: 2, failures: 1 },
    });
  });

  it('records nothing but the door and the counts', async () => {
    await recordOfflineServe({ ...REPORT, url: '/rates', userId: 'x' }, IP);

    // The schema strips unknown keys, so a stray URL or id cannot reach the log.
    const context = mockInfo.mock.calls[0]?.[1];
    expect(context && Object.keys(context).sort()).toEqual(['cache', 'door', 'version']);
  });

  it('rejects anything that is not a known door before it spends a bucket', async () => {
    for (const body of [
      null,
      {},
      { ...REPORT, door: 'somewhere-else' },
      { ...REPORT, door: 'navigation-deadline', cache: { hits: -1, misses: 0, failures: 0 } },
      { ...REPORT, version: 2 },
    ]) {
      const result = await recordOfflineServe(body, IP);
      expect(result.status).toBe(400);
    }

    expect(mockCheckRateLimitApi).not.toHaveBeenCalled();
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it('raises a regression door to a Sentry warning, one issue per door', async () => {
    await recordOfflineServe(REPORT, IP);

    expect(mockCaptureMessage).toHaveBeenCalledWith('[offline-serve]', {
      level: 'warning',
      fingerprint: ['offline-serve', 'navigation-deadline'],
      tags: { 'offline.door': 'navigation-deadline', 'offline.version': '1' },
      extra: { cache: { hits: 4, misses: 2, failures: 1 } },
    });
  });

  it('keeps an accepted door at info, so the trend exists without paging', async () => {
    await recordOfflineServe({ ...REPORT, door: 'online-only-offline' }, IP);

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      '[offline-serve]',
      expect.objectContaining({
        level: 'info',
        tags: { 'offline.door': 'online-only-offline', 'offline.version': '1' },
      })
    );
  });

  it('accepts a graceful prefix serve as its own door (#490)', async () => {
    // A prefix serve paints the parent's shell instead of failing, but it is
    // counted through the same beacon so the field can tell the fallback from a
    // real miss.
    const result = await recordOfflineServe({ ...REPORT, door: 'navigation-prefix' }, IP);

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      '[offline-serve]',
      expect.objectContaining({
        level: 'info',
        tags: { 'offline.door': 'navigation-prefix', 'offline.version': '1' },
      })
    );
  });

  it('refuses the doors the withdrawn offline page owned', async () => {
    for (const door of ['no-fallback']) {
      const result = await recordOfflineServe({ ...REPORT, door }, IP);
      expect(result.status).toBe(400);
    }
  });

  it('never sends a malformed report or the stray keys it stripped', async () => {
    await recordOfflineServe({ ...REPORT, url: '/rates', userId: 'x' }, IP);
    await recordOfflineServe({ ...REPORT, door: 'somewhere-else' }, IP);

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mockCaptureMessage.mock.calls[0])).not.toContain('/rates');
    expect(JSON.stringify(mockCaptureMessage.mock.calls[0])).not.toContain('userId');
  });

  it('denies when the limiter fails closed', async () => {
    mockCheckRateLimitApi.mockResolvedValue({
      status: 429,
      body: { success: false, error: 'limited' },
    });

    const result = await recordOfflineServe(REPORT, IP);

    expect(result.status).toBe(429);
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it('counts the beacon per IP and closes the bucket on a limiter outage', async () => {
    await recordOfflineServe(REPORT, IP);

    expect(mockCheckRateLimitApi).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `offline-serve:${IP}`,
        limit: 30,
        windowMs: 60_000,
        failClosed: true,
      })
    );
  });
});
