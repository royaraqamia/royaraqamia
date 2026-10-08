import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockDispatch = vi.fn();
const mockRecordResult = vi.fn();
const mockVerifyTurnstile = vi.fn();
const mockCheckRateLimitApi = vi.fn();
const mockRunAfter = vi.fn();
const mockCaptureMessage = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}));
vi.mock('@/backend/config/after', () => ({
  runAfter: (fn: () => unknown) => mockRunAfter(fn),
}));
vi.mock('@/backend/middleware/http', () => ({
  checkRateLimitApi: (config: unknown) => mockCheckRateLimitApi(config),
}));
vi.mock('@/backend/config/env', () => ({
  env: { downloaderCallbackSecret: 'sekret' },
}));
vi.mock('@/backend/config/downloader', () => ({
  createDownloaderService: () => ({
    create: mockCreate,
    dispatch: mockDispatch,
    recordResult: mockRecordResult,
  }),
  createDownloaderTurnstileVerifier: () => (token: string) => mockVerifyTurnstile(token),
}));

import { createDownloadJob, recordDownloadCallback } from '@/backend/controllers/downloader';
import { downloaderRateLimitPolicy } from '@/backend/config/rate-limiter';

const VALID_BODY = { url: 'https://example.com/v/1', format: 'video-720p' };
const IP = '1.2.3.4';
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const READY_CALLBACK = {
  jobId: JOB_ID,
  status: 'ready',
  platform: 'example.com',
  durationSeconds: 12,
  file: {
    url: 'https://media.example.com/x.mp4',
    filename: 'x.mp4',
    sizeBytes: 10,
    expiresAt: '2030-01-01T00:00:00.000Z',
  },
};

describe('downloader controller createDownloadJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyTurnstile.mockResolvedValue(true);
    mockCheckRateLimitApi.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: JOB_ID, status: 'queued' });
    mockDispatch.mockResolvedValue(undefined);
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

  it('accepts a valid request, schedules dispatch, and returns 202', async () => {
    const result = await createDownloadJob(VALID_BODY, IP);

    expect(result).toMatchObject({ status: 202 });
    expect(mockCreate).toHaveBeenCalledWith({ url: VALID_BODY.url, format: VALID_BODY.format });
    expect(mockRunAfter).toHaveBeenCalledTimes(1);
  });
});

describe('downloader controller recordDownloadCallback', () => {
  const secretHeaders = new Headers({ 'x-downloader-callback-secret': 'sekret' });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordResult.mockResolvedValue(undefined);
  });

  it('rejects a request with no secret (cannot be driven by the public)', async () => {
    const result = await recordDownloadCallback(READY_CALLBACK, new Headers());

    expect(result).toMatchObject({ status: 401 });
    expect(mockRecordResult).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong secret', async () => {
    const result = await recordDownloadCallback(
      READY_CALLBACK,
      new Headers({ 'x-downloader-callback-secret': 'wrong' })
    );

    expect(result).toMatchObject({ status: 401 });
    expect(mockRecordResult).not.toHaveBeenCalled();
  });

  it('rejects a valid-secret request with a malformed body', async () => {
    const result = await recordDownloadCallback({ jobId: 'not-a-uuid' }, secretHeaders);

    expect(result).toMatchObject({ status: 400 });
    expect(mockRecordResult).not.toHaveBeenCalled();
  });

  it('records a ready result for an authenticated provider', async () => {
    const result = await recordDownloadCallback(READY_CALLBACK, secretHeaders);

    expect(result).toMatchObject({ status: 200 });
    expect(mockRecordResult).toHaveBeenCalledWith(READY_CALLBACK);
  });

  it('records a failed result for an authenticated provider', async () => {
    const failure = { jobId: JOB_ID, status: 'failed', error: 'هذا الرابط غير مدعوم.' };

    const result = await recordDownloadCallback(failure, secretHeaders);

    expect(result).toMatchObject({ status: 200 });
    expect(mockRecordResult).toHaveBeenCalledWith(failure);
  });

  it('reports a classified provider failure to Sentry', async () => {
    const failure = {
      jobId: JOB_ID,
      status: 'failed',
      code: 'blocked',
      error: 'الموقع يحجب خادم التنزيل مؤقتًا.',
    };

    await recordDownloadCallback(failure, secretHeaders);

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ tags: { 'downloader.failure_code': 'blocked' } })
    );
  });

  it('does not report a ready result to Sentry', async () => {
    await recordDownloadCallback(READY_CALLBACK, secretHeaders);

    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});
