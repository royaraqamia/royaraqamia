import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRequest, MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status?: number;

    constructor(message: string, status?: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }

    get isNetworkError(): boolean {
      return this.status === undefined;
    }
  }

  return { mockRequest: vi.fn(), MockApiError };
});

vi.mock('@/frontend/transport/http', () => ({
  request: mockRequest,
  ApiError: MockApiError,
}));

import { getCertificateById, getCertificates } from '../certificates';

// The admin console may not show "nothing here" for a request that never
// arrived (ADR-0031, #368).
describe('admin certificate reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets a failed list load through instead of answering an empty page', async () => {
    mockRequest.mockRejectedValue(new MockApiError('تعذّر الاتصال بالخادم.'));

    await expect(getCertificates()).rejects.toBeInstanceOf(MockApiError);
  });

  it('keeps "not found" as the only empty answer for one certificate', async () => {
    mockRequest.mockRejectedValue(new MockApiError('غير موجود', 404));

    await expect(getCertificateById('abc')).resolves.toBeNull();
  });

  it('lets an unreachable certificate read through', async () => {
    mockRequest.mockRejectedValue(new MockApiError('تعذّر الاتصال بالخادم.'));

    await expect(getCertificateById('abc')).rejects.toBeInstanceOf(MockApiError);
  });

  it('lets a server-answered certificate failure through too', async () => {
    mockRequest.mockRejectedValue(new MockApiError('الخدمة غير متاحة', 503));

    await expect(getCertificateById('abc')).rejects.toBeInstanceOf(MockApiError);
  });
});
