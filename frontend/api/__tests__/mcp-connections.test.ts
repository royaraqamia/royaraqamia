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
  disconnectAllMcpConnections,
  disconnectMcpConnection,
  getMcpConnections,
} from '../mcp-connections';

describe('getMcpConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the account’s connections without caching', async () => {
    mockRequest.mockResolvedValue({ success: true, data: [{ clientId: 'client-1' }] });

    await expect(getMcpConnections()).resolves.toEqual([{ clientId: 'client-1' }]);
    expect(mockRequest).toHaveBeenCalledWith('/api/me/mcp/connections', { cache: 'no-store' });
  });

  it('treats a missing data field as no connections', async () => {
    mockRequest.mockResolvedValue({ success: true });

    await expect(getMcpConnections()).resolves.toEqual([]);
  });

  it('propagates a failed read so the page can say it could not tell', async () => {
    mockRequest.mockRejectedValue(new Error('غير مصرح'));

    await expect(getMcpConnections()).rejects.toThrow('غير مصرح');
  });
});

describe('disconnectMcpConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('addresses one client, escaped', async () => {
    mockRequest.mockResolvedValue({ success: true });

    await expect(disconnectMcpConnection('client/1')).resolves.toEqual({ success: true });
    expect(mockRequest).toHaveBeenCalledWith('/api/me/mcp/connections/client%2F1', {
      method: 'DELETE',
    });
  });

  it('turns a rejected request into a result the caller can render', async () => {
    mockRequest.mockRejectedValue(new Error('تعذّر فصل التَّطبيق.'));

    await expect(disconnectMcpConnection('client-1')).resolves.toEqual({
      success: false,
      error: 'تعذّر فصل التَّطبيق.',
    });
  });
});

describe('disconnectAllMcpConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the collection', async () => {
    mockRequest.mockResolvedValue({ success: true });

    await expect(disconnectAllMcpConnections()).resolves.toEqual({ success: true });
    expect(mockRequest).toHaveBeenCalledWith('/api/me/mcp/connections', { method: 'DELETE' });
  });

  it('turns a rejected request into a result the caller can render', async () => {
    mockRequest.mockRejectedValue(new Error('الخدمة غير متاحة'));

    await expect(disconnectAllMcpConnections()).resolves.toEqual({
      success: false,
      error: 'الخدمة غير متاحة',
    });
  });
});
