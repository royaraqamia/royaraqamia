import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRequest, MockApiError } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  MockApiError: class ApiError extends Error {
    status?: number;
  },
}));

vi.mock('@/frontend/transport/http', () => ({
  request: mockRequest,
  ApiError: MockApiError,
}));

import {
  disconnectAllMcpConnectedApps,
  disconnectMcpConnectedApp,
  getMcpConnectedApps,
} from '../mcp-connected-apps';

describe('getMcpConnectedApps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the account’s connected apps without caching', async () => {
    mockRequest.mockResolvedValue({ success: true, data: [{ clientId: 'client-1' }] });

    await expect(getMcpConnectedApps()).resolves.toEqual([{ clientId: 'client-1' }]);
    expect(mockRequest).toHaveBeenCalledWith('/api/me/mcp/connected-apps', { cache: 'no-store' });
  });

  it('treats a missing data field as no connected apps', async () => {
    mockRequest.mockResolvedValue({ success: true });

    await expect(getMcpConnectedApps()).resolves.toEqual([]);
  });

  it('propagates a failed read so the page can say it could not tell', async () => {
    mockRequest.mockRejectedValue(new Error('غير مصرح'));

    await expect(getMcpConnectedApps()).rejects.toThrow('غير مصرح');
  });
});

describe('disconnectMcpConnectedApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('addresses one client, escaped', async () => {
    mockRequest.mockResolvedValue({ success: true });

    await expect(disconnectMcpConnectedApp('client/1')).resolves.toEqual({ success: true });
    expect(mockRequest).toHaveBeenCalledWith('/api/me/mcp/connected-apps/client%2F1', {
      method: 'DELETE',
    });
  });

  it('turns a rejected request into a result the caller can render', async () => {
    mockRequest.mockRejectedValue(new Error('تعذّر فصل التَّطبيق.'));

    await expect(disconnectMcpConnectedApp('client-1')).resolves.toEqual({
      success: false,
      error: 'تعذّر فصل التَّطبيق.',
    });
  });
});

describe('disconnectAllMcpConnectedApps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the collection', async () => {
    mockRequest.mockResolvedValue({ success: true });

    await expect(disconnectAllMcpConnectedApps()).resolves.toEqual({ success: true });
    expect(mockRequest).toHaveBeenCalledWith('/api/me/mcp/connected-apps', { method: 'DELETE' });
  });

  it('turns a rejected request into a result the caller can render', async () => {
    mockRequest.mockRejectedValue(new Error('الخدمة غير متاحة'));

    await expect(disconnectAllMcpConnectedApps()).resolves.toEqual({
      success: false,
      error: 'الخدمة غير متاحة',
    });
  });
});
