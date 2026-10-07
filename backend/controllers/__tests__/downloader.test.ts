import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockProcess = vi.fn();
const mockVerifyTurnstile = vi.fn();
const mockCheckRateLimitApi = vi.fn();
const mockRunAfter = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/backend/config/after', () => ({
  runAfter: (fn: () => unknown) => mockRunAfter(fn),
}));
vi.mock('@/backend/middleware/http', () => ({
  checkRateLimitApi: (config: unknown) => mockCheckRateLimitApi(config),
}));
vi.mock('@/backend/config/downloader', () => ({
  createDownloaderService: () => ({ create: mockCreate, process: mockProcess }),
  createDownloaderTurnstileVerifier: () => (token: string) => mockVerifyTurnstile(token),
}));

import { createDownloadJob } from '@/backend/controllers/downloader';
import { downloaderRateLimitPolicy } from '@/backend/config/rate-limiter';

const VALID_BODY = { url: 'https://example.com/v/1', format: 'video-720p' };
const IP = '1.2.3.4';

describe('downloader controller createDownloadJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyTurnstile.mockResolvedValue(true);
    mockCheckRateLimitApi.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'job-1', status: 'queued' });
    mockProcess.mockResolvedValue(undefined);
  });

  it('rejects when Turnstile fails, before creating a job', async () => {
    mockVerifyTurnstile.mockResolvedValue(false);

    const result = await createDownloadJob(VALID_BODY, IP);

    expect(result).toMatchObject({ status: 403 });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects with 429 when the per-IP limit is exhausted', async () => {
    mockCheckRateLimitApi.mockResolvedValue({
      status: 429,
      body: { success: false, error: 'limit' },
    });

    const result = await createDownloadJob(VALID_BODY, IP);

    expect(result).toMatchObject({ status: 429 });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('applies the fail-closed per-IP policy', async () => {
    await createDownloadJob(VALID_BODY, IP);

    expect(mockCheckRateLimitApi).toHaveBeenCalledWith({
      ...downloaderRateLimitPolicy(IP),
      failClosed: true,
    });
  });

  it('rejects an SSRF source before any gate', async () => {
    const result = await createDownloadJob(
      { url: 'http://127.0.0.1/a.mp4', format: 'video-720p' },
      IP
    );

    expect(result).toMatchObject({ status: 400 });
    expect(mockVerifyTurnstile).not.toHaveBeenCalled();
  });

  it('accepts a valid request, schedules processing, and returns 202', async () => {
    const result = await createDownloadJob(VALID_BODY, IP);

    expect(result).toMatchObject({ status: 202 });
    expect(mockCreate).toHaveBeenCalledWith({ url: VALID_BODY.url, format: VALID_BODY.format });
    expect(mockRunAfter).toHaveBeenCalledTimes(1);
  });
});
