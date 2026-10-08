import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRegister = vi.fn();

vi.mock('@/backend/middleware/http', () => ({
  checkRateLimitApi: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/backend/services/mcp/oauth-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/backend/services/mcp/oauth-provider')>();
  return {
    ...actual,
    createMcpOAuthProvider: () => ({ registerClient: mockRegister }),
  };
});

import { POST } from '@/app/mcp/register/route';

function makeReq(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRegister.mockResolvedValue({
    client_id: 'client-1',
    client_name: 'Client 1',
    redirect_uris: [],
    scopes: [],
  });
});

describe('POST /mcp/register — redirect URI scheme policy (ADR 0022)', () => {
  it('accepts an https redirect URI', async () => {
    const res = await POST(
      makeReq({ redirect_uris: ['https://agent.example/callback'] }) as NextRequest
    );
    expect(res.status).toBe(201);
  });

  it('accepts http loopback URIs for local development', async () => {
    for (const uri of [
      'http://localhost:3000/callback',
      'http://127.0.0.1:9090/auth',
      'http://[::1]:3000/callback',
    ]) {
      const res = await POST(makeReq({ redirect_uris: [uri] }) as NextRequest);
      expect(res.status).toBe(201);
    }
  });

  it('rejects plain http non-loopback URIs', async () => {
    const res = await POST(
      makeReq({ redirect_uris: ['http://agent.example/callback'] }) as NextRequest
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_redirect_uri' });
  });

  it('rejects non-web schemes', async () => {
    for (const uri of ['javascript:alert(1)', 'com.example.app:/oauth2redirect', 'not a url']) {
      const res = await POST(makeReq({ redirect_uris: [uri] }) as NextRequest);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_redirect_uri' });
    }
  });

  it('still rejects an empty redirect_uris array', async () => {
    const res = await POST(makeReq({ redirect_uris: [] }) as NextRequest);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_redirect_uri' });
  });
});
