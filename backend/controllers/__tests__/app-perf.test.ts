import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockCheckRateLimitApi = vi.fn();
const mockInfo = vi.fn();
const mockRecord = vi.fn();

vi.mock('@/backend/middleware/http', () => ({
  checkRateLimitApi: (config: unknown) => mockCheckRateLimitApi(config),
}));
vi.mock('@/backend/shared/logger', () => ({
  logger: { info: (...args: unknown[]) => mockInfo(...args), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/backend/config/observability', () => ({
  createAppPerfService: () => ({ record: (report: unknown) => mockRecord(report) }),
}));

import { recordAppPerf } from '@/backend/controllers/app-perf';

const IP = '1.2.3.4';
const LAUNCH = {
  version: 1,
  kind: 'launch',
  platform: 'pwa',
  cold: false,
  shellMs: 120,
  contentMs: 240,
};
const TAP = { version: 1, kind: 'tap', platform: 'shell', paintMs: 40 };
const VITALS = {
  version: 1,
  kind: 'vitals',
  platform: 'web',
  lcpMs: 2100,
  cls: 0.04,
  inpMs: 120,
  ttfbMs: 300,
};

describe('recordAppPerf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimitApi.mockResolvedValue(null);
    mockRecord.mockResolvedValue(undefined);
  });

  it('writes a launch as one log line with the platform, the flag and both durations', async () => {
    const result = await recordAppPerf(LAUNCH, IP);

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(mockInfo).toHaveBeenCalledWith('[app-perf]', {
      version: 1,
      kind: 'launch',
      platform: 'pwa',
      cold: false,
      shellMs: 120,
      contentMs: 240,
    });
    expect(mockRecord).toHaveBeenCalledWith(LAUNCH);
  });

  it('writes a tap as one log line with the single duration', async () => {
    await recordAppPerf(TAP, IP);

    expect(mockInfo).toHaveBeenCalledWith('[app-perf]', {
      version: 1,
      kind: 'tap',
      platform: 'shell',
      paintMs: 40,
    });
    expect(mockRecord).toHaveBeenCalledWith(TAP);
  });

  it('writes field vitals as one log line with no page or user context', async () => {
    await recordAppPerf({ ...VITALS, url: '/account', userId: 'x' }, IP);

    expect(mockInfo).toHaveBeenCalledWith('[app-perf]', {
      version: 1,
      kind: 'vitals',
      platform: 'web',
      lcpMs: 2100,
      cls: 0.04,
      inpMs: 120,
      ttfbMs: 300,
    });
    expect(mockRecord).toHaveBeenCalledWith(VITALS);
  });

  it('records nothing a reporter did not send', async () => {
    await recordAppPerf({ ...LAUNCH, url: '/habitflow', userId: 'x', sessionId: 'y' }, IP);

    // The schema strips unknown keys, so a stray URL, user or session cannot reach the log.
    const context = mockInfo.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(context).sort()).toEqual([
      'cold',
      'contentMs',
      'kind',
      'platform',
      'shellMs',
      'version',
    ]);
  });

  it('rejects anything outside the contract before it spends a bucket', async () => {
    for (const body of [
      null,
      {},
      { ...LAUNCH, platform: 'desktop' },
      { ...LAUNCH, cold: 'yes' },
      { ...LAUNCH, contentMs: -1 },
      { ...LAUNCH, contentMs: 600_001 },
      { ...TAP, paintMs: 60_001 },
      { ...TAP, kind: 'launch' },
      { ...LAUNCH, version: 2 },
    ]) {
      const result = await recordAppPerf(body, IP);
      expect(result.status).toBe(400);
    }

    expect(mockCheckRateLimitApi).not.toHaveBeenCalled();
    expect(mockInfo).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('denies when the limiter fails closed', async () => {
    mockCheckRateLimitApi.mockResolvedValue({
      status: 429,
      body: { success: false, error: 'limited' },
    });

    const result = await recordAppPerf(LAUNCH, IP);

    expect(result.status).toBe(429);
    expect(mockInfo).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('answers 200 when the sink refuses the row, because the beacon is droppable', async () => {
    mockRecord.mockRejectedValue(new Error('perf_samples is unavailable'));

    const result = await recordAppPerf(LAUNCH, IP);

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(mockInfo).toHaveBeenCalledWith(
      '[app-perf]',
      expect.objectContaining({ kind: 'launch' })
    );
  });

  it('counts the beacon per IP and closes the bucket on a limiter outage', async () => {
    await recordAppPerf(LAUNCH, IP);

    expect(mockCheckRateLimitApi).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `app-perf:${IP}`,
        limit: 60,
        windowMs: 60_000,
        failClosed: true,
      })
    );
  });
});
