import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextRequest, NextResponse } from 'next/server';

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      data,
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
    })),
  },
}));

const mockCheckRateLimitApi = vi.fn();
const mockRecord = vi.fn();

vi.mock('@/backend/middleware/http', () => ({
  checkRateLimitApi: (config: unknown) => mockCheckRateLimitApi(config),
}));
vi.mock('@/backend/shared/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/backend/config/observability', () => ({
  createAppFailureService: () => ({ record: (report: unknown) => mockRecord(report) }),
}));

import { POST } from '@/app/api/app-failures/route';

const IP = '203.0.113.7';

function request(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: new Headers({ 'x-real-ip': IP }),
  } as unknown as NextRequest;
}

function body(res: NextResponse): unknown {
  return (res as unknown as { data: unknown }).data;
}

const CRASH = {
  version: 1,
  kind: 'crash',
  reason: 'uncaught',
  signature: 'java.lang.IllegalStateException',
  shell: { name: '1.0.21', code: 20021 },
  contracts: '05eb4c086b1b',
  frames: ['com.royaraqamia.app.Shell.onCreate(Shell.kt:9)'],
  at: 1_700_000_000_000,
};

describe('POST /api/app-failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimitApi.mockResolvedValue(null);
  });

  it('accepts a report the app actually sends', async () => {
    const res = await POST(request(CRASH));

    expect(res.status).toBe(200);
    expect(body(res)).toEqual({ success: true });
    expect(mockRecord).toHaveBeenCalledWith(CRASH);
    expect(mockCheckRateLimitApi).toHaveBeenCalledWith(
      expect.objectContaining({ key: `app-failure:${IP}`, limit: 30 })
    );
  });

  it('answers 400 for a body the contract refuses, before it spends a bucket', async () => {
    const res = await POST(request({ ...CRASH, contracts: 'HEAD' }));

    expect(res.status).toBe(400);
    expect(body(res)).toEqual({ success: false, error: 'تقرير عطل غير صالح.' });
    expect(mockCheckRateLimitApi).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('answers 400 when the body is not JSON at all', async () => {
    const broken = {
      json: async () => Promise.reject(new Error('bad json')),
      headers: new Headers({ 'x-real-ip': IP }),
    } as unknown as NextRequest;

    const res = await POST(broken);

    expect(res.status).toBe(400);
  });

  it('answers 429 when the limiter refuses, and files nothing', async () => {
    mockCheckRateLimitApi.mockResolvedValue({
      status: 429,
      body: { success: false, error: 'limited' },
    });

    const res = await POST(request(CRASH));

    expect(res.status).toBe(429);
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
