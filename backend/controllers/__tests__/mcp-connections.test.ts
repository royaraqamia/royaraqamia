import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockList = vi.fn();
const mockDisconnect = vi.fn();
const mockDisconnectAll = vi.fn();
const mockGetAuthUser = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({ session: async () => mockGetAuthUser() });
});

vi.mock('@/backend/config/mcp', () => ({
  createDefaultMcpConnectionService: () => ({
    list: mockList,
    disconnect: mockDisconnect,
    disconnectAll: mockDisconnectAll,
  }),
}));

import {
  disconnectAllMcpConnections,
  disconnectMcpConnection,
  listMcpConnections,
} from '@/backend/controllers/mcp-connections';

const SAME_ORIGIN = new Headers({ 'sec-fetch-site': 'same-origin' });
const CROSS_SITE = new Headers({ 'sec-fetch-site': 'cross-site' });

const SESSION = { user: { id: 'user-1', email: 'user@example.com' }, client: {} };
const SIGNED_OUT = { user: null, client: {} };

const CONNECTIONS = [
  {
    clientId: 'client-1',
    clientName: 'Claude Code',
    connectedAt: '2026-09-01T10:00:00.000Z',
    lastUsedAt: null,
  },
];

describe('mcp-connections controller: listMcpConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue(SESSION);
    mockList.mockResolvedValue(CONNECTIONS);
  });

  it('returns the signed-in user’s grants', async () => {
    const result = await listMcpConnections();

    expect(result).toMatchObject({ status: 200, body: { success: true, data: CONNECTIONS } });
    expect(mockList).toHaveBeenCalledWith('user-1');
  });

  it('answers 401 when signed out and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await listMcpConnections();

    expect(result).toMatchObject({ status: 401 });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('answers a readable 500 on a genuine failure', async () => {
    mockList.mockRejectedValue(new Error('db down'));

    const result = await listMcpConnections();

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذّر تحميل التَّطبيقات المتَّصلة.' },
    });
  });
});

describe('mcp-connections controller: disconnectMcpConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue(SESSION);
    mockDisconnect.mockResolvedValue(undefined);
  });

  it('disconnects the addressed client for the session user', async () => {
    const result = await disconnectMcpConnection('client-1', SAME_ORIGIN);

    expect(result).toMatchObject({ status: 200, body: { success: true } });
    expect(mockDisconnect).toHaveBeenCalledWith('user-1', 'client-1');
  });

  it('refuses a cross-site request before touching the grant', async () => {
    const result = await disconnectMcpConnection('client-1', CROSS_SITE);

    expect(result).toMatchObject({
      status: 403,
      body: { success: false, error: 'طلب غير مسموح' },
    });
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('answers 401 when signed out', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await disconnectMcpConnection('client-1', SAME_ORIGIN);

    expect(result).toMatchObject({ status: 401 });
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('reports a failure instead of a silent success', async () => {
    mockDisconnect.mockRejectedValue(new Error('shred failed'));

    const result = await disconnectMcpConnection('client-1', SAME_ORIGIN);

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذّر فصل التَّطبيق.' },
    });
  });
});

describe('mcp-connections controller: disconnectAllMcpConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue(SESSION);
    mockDisconnectAll.mockResolvedValue(undefined);
  });

  it('disconnects every client the session user has', async () => {
    const result = await disconnectAllMcpConnections(SAME_ORIGIN);

    expect(result).toMatchObject({ status: 200, body: { success: true } });
    expect(mockDisconnectAll).toHaveBeenCalledWith('user-1');
  });

  it('refuses a cross-site request', async () => {
    const result = await disconnectAllMcpConnections(CROSS_SITE);

    expect(result).toMatchObject({ status: 403 });
    expect(mockDisconnectAll).not.toHaveBeenCalled();
  });

  it('reports a failure instead of a silent success', async () => {
    mockDisconnectAll.mockRejectedValue(new Error('shred failed'));

    const result = await disconnectAllMcpConnections(SAME_ORIGIN);

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذّر فصل التَّطبيقات.' },
    });
  });
});
