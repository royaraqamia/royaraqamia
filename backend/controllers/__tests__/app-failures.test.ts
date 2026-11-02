import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockCheckRateLimitApi = vi.fn();
const mockWarn = vi.fn();
const mockRecord = vi.fn();

vi.mock('@/backend/middleware/http', () => ({
  checkRateLimitApi: (config: unknown) => mockCheckRateLimitApi(config),
}));
vi.mock('@/backend/shared/logger', () => ({
  logger: { info: vi.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: vi.fn() },
}));
vi.mock('@/backend/config/observability', () => ({
  createAppFailureService: () => ({ record: (report: unknown) => mockRecord(report) }),
}));

import { recordAppFailure } from '@/backend/controllers/app-failures';

const IP = '1.2.3.4';
const SHELL = { name: '1.0.21', code: 20021 };
const CRASH = {
  version: 1,
  kind: 'crash',
  reason: 'uncaught',
  signature: 'java.lang.IllegalStateException',
  shell: SHELL,
  contracts: '05eb4c086b1b',
  frames: ['com.royaraqamia.app.Shell.onCreate(Shell.kt:9)'],
};

describe('recordAppFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimitApi.mockResolvedValue(null);
  });

  it('records a crash, names its release and answers the app', async () => {
    const result = await recordAppFailure(CRASH, IP);

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(mockRecord).toHaveBeenCalledWith(CRASH);
    expect(mockWarn).toHaveBeenCalledWith('[app-failure]', {
      version: 1,
      kind: 'crash',
      reason: 'uncaught',
      signature: 'java.lang.IllegalStateException',
      shell: '1.0.21+20021',
      contracts: '05eb4c086b1b',
      pending: null,
      failed: null,
    });
  });

  it('records nothing a reporter did not send', async () => {
    await recordAppFailure({ ...CRASH, url: '/habitflow?token=abc', userId: 'x' }, IP);

    const context = mockWarn.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(context).sort()).toEqual([
      'contracts',
      'failed',
      'kind',
      'pending',
      'reason',
      'shell',
      'signature',
      'version',
    ]);
    // The frame list is the only place a stray URL could have hidden, and the
    // schema refused it before the limiter ran.
  });

  it('rejects anything outside the contract before it spends a bucket', async () => {
    for (const body of [
      null,
      {},
      { ...CRASH, kind: 'panic' },
      { ...CRASH, reason: 'refused' },
      { ...CRASH, contracts: 'latest' },
      { ...CRASH, shell: { name: '1.0.21', code: -1 } },
      { ...CRASH, version: 2 },
      { ...CRASH, frames: ['text with spaces'] },
    ]) {
      const result = await recordAppFailure(body, IP);
      expect(result.status).toBe(400);
    }

    expect(mockCheckRateLimitApi).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('denies when the limiter fails closed', async () => {
    mockCheckRateLimitApi.mockResolvedValue({
      status: 429,
      body: { success: false, error: 'limited' },
    });

    const result = await recordAppFailure(CRASH, IP);

    expect(result.status).toBe(429);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('counts the report per IP and closes the bucket on a limiter outage', async () => {
    await recordAppFailure(CRASH, IP);

    expect(mockCheckRateLimitApi).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `app-failure:${IP}`,
        limit: 30,
        windowMs: 60_000,
        failClosed: true,
      })
    );
  });
});
