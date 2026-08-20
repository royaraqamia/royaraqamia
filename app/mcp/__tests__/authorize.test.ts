import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextRequest, NextResponse } from 'next/server';

const mockGetClient = vi.fn();
const mockGetSession = vi.fn();

vi.mock('@/backend/services/mcp/oauth-provider', () => ({
  createMcpOAuthProvider: () => ({ getClient: mockGetClient }),
}));

vi.mock('@/backend/config/supabase', () => ({
  createServerSupabaseClient: () => ({
    auth: { getSession: () => mockGetSession() },
  }),
}));

import { GET } from '@/app/mcp/authorize/route';

const client = {
  id: 'client-1',
  client_name: 'Client 1',
  redirect_uris: ['https://client.example/callback'],
  scopes: ['tools/read'],
  expires_at: null,
  client_secret_hash: null,
  created_at: '2026-08-01T00:00:00.000Z',
};

function makeReq(query: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/mcp/authorize');
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return { url: url.toString(), nextUrl: url } as unknown as NextRequest;
}

async function readBody(res: NextResponse): Promise<{ error: string }> {
  return (await res.json()) as { error: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClient.mockResolvedValue(client);
});

describe('GET /mcp/authorize', () => {
  it('does not redirect to an unregistered redirect_uri on an invalid response_type', async () => {
    const res = await GET(
      makeReq({
        response_type: 'bogus',
        client_id: 'client-1',
        redirect_uri: 'https://evil.example',
      })
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
    expect(await readBody(res)).toEqual({
      error: 'unsupported_response_type',
      error_description: 'response_type must be "code"',
    });
  });

  it('never redirects when the client is unknown', async () => {
    mockGetClient.mockResolvedValue(null);
    const res = await GET(
      makeReq({ response_type: 'bogus', redirect_uri: 'https://evil.example' })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects an error back to a registered redirect_uri', async () => {
    const res = await GET(
      makeReq({
        response_type: 'bogus',
        client_id: 'client-1',
        redirect_uri: 'https://client.example/callback',
        state: 'state-123',
      })
    );
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('error=unsupported_response_type');
    expect(location).toContain('state=state-123');
  });

  it('rejects an unregistered redirect_uri for a valid authorization request', async () => {
    const res = await GET(
      makeReq({
        response_type: 'code',
        client_id: 'client-1',
        redirect_uri: 'https://evil.example',
      })
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
    expect(await readBody(res)).toEqual({
      error: 'invalid_request',
      error_description: 'redirect_uri is not registered for this client',
    });
  });

  it('does not redirect an expired client to an unregistered redirect_uri', async () => {
    mockGetClient.mockResolvedValue({ ...client, expires_at: '2020-01-01T00:00:00.000Z' });
    const res = await GET(
      makeReq({
        response_type: 'code',
        client_id: 'client-1',
        redirect_uri: 'https://evil.example',
      })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('location')).toBeNull();
  });
});
