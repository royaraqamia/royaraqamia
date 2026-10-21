import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const { mockGetClient, mockRevokeToken, mockCheckRateLimitApi } = vi.hoisted(() => ({
  mockGetClient: vi.fn(),
  mockRevokeToken: vi.fn(),
  mockCheckRateLimitApi: vi.fn(),
}));

vi.mock('@/backend/middleware/http', () => ({ checkRateLimitApi: mockCheckRateLimitApi }));

vi.mock('@/backend/services/mcp/oauth-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/backend/services/mcp/oauth-provider')>();
  return {
    ...actual,
    createMcpOAuthProvider: () => ({
      getClient: mockGetClient,
      revokeToken: mockRevokeToken,
    }),
  };
});

import { POST } from '@/app/mcp/revoke/route';

const IP = '203.0.113.9';

const client = {
  id: 'client-1',
  client_name: 'Client 1',
  redirect_uris: ['https://client.example/callback'],
  scopes: ['tools/read'],
  expires_at: null,
  client_secret_hash: null,
  created_at: '2026-08-01T00:00:00.000Z',
};

function makeReq(fields: Record<string, string> = {}): NextRequest {
  const form = new FormData();
  for (const [key, value] of Object.entries({ client_id: 'client-1', ...fields })) {
    form.set(key, value);
  }
  return {
    url: 'http://localhost/mcp/revoke',
    headers: new Headers({ 'x-real-ip': IP }),
    formData: async () => form,
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimitApi.mockResolvedValue(null);
  mockGetClient.mockResolvedValue(client);
  mockRevokeToken.mockResolvedValue(undefined);
});

describe('POST /mcp/revoke — rate limiting', () => {
  it('returns 429 without a client or token lookup when the limit is exceeded', async () => {
    mockCheckRateLimitApi.mockResolvedValue({
      status: 429,
      body: { success: false, error: 'limited' },
    });

    const res = await POST(makeReq({ token: 'tok' }));

    expect(res.status).toBe(429);
    expect(mockGetClient).not.toHaveBeenCalled();
    expect(mockRevokeToken).not.toHaveBeenCalled();
  });

  it('limits the caller IP on its own bucket, fail-closed, before the client lookup', async () => {
    await POST(makeReq({ token: 'tok' }));

    expect(mockCheckRateLimitApi).toHaveBeenCalledWith({
      key: `mcp-revoke:${IP}`,
      limit: 30,
      windowMs: 10 * 60 * 1000,
      message: expect.any(String),
      failClosed: true,
    });
    expect(mockCheckRateLimitApi.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetClient.mock.invocationCallOrder[0] as number
    );
  });
});

describe('POST /mcp/revoke — RFC 7009 behaviour', () => {
  it('answers 200 for a token nobody recognises', async () => {
    const res = await POST(makeReq({ token: 'unknown-token' }));

    expect(res.status).toBe(200);
    expect(mockRevokeToken).toHaveBeenCalledWith({
      token: 'unknown-token',
      client,
      clientSecret: undefined,
    });
  });

  it('rejects a request with no token before the client lookup', async () => {
    const res = await POST(makeReq());

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_request' });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects an unknown client_id', async () => {
    mockGetClient.mockResolvedValue(null);

    const res = await POST(makeReq({ token: 'tok', client_id: 'nope' }));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'invalid_client' });
    expect(mockRevokeToken).not.toHaveBeenCalled();
  });
});
