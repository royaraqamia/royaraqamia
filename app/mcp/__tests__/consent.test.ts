import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextRequest, NextResponse } from 'next/server';

const mockGetClient = vi.fn();
const mockGetUser = vi.fn();
const mockGetSession = vi.fn();
const mockCreateAuthorizationCode = vi.fn();

vi.mock('@/backend/config/env', () => ({
  env: {
    baseUrl: 'https://royaraqamia.com',
    mcpTokenEncryptionKey: '00'.repeat(32),
    adminEmails: [],
  },
}));

vi.mock('@/backend/services/mcp/oauth-provider', () => ({
  createMcpOAuthProvider: () => ({
    getClient: mockGetClient,
    createAuthorizationCode: mockCreateAuthorizationCode,
  }),
}));

vi.mock('@/backend/config/supabase', () => ({
  createServerSupabaseClient: () => ({
    auth: { getUser: () => mockGetUser(), getSession: () => mockGetSession() },
  }),
}));

vi.mock('next/headers', () => ({
  cookies: () => ({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

import { POST } from '@/app/mcp/connect/consent/route';

const client = {
  id: 'client-1',
  client_name: 'Client 1',
  redirect_uris: ['https://client.example/callback'],
  scopes: ['tools/read'],
  expires_at: null,
  client_secret_hash: null,
  created_at: '2026-08-01T00:00:00.000Z',
};

function makeForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const base: Record<string, string> = {
    action: 'approve',
    client_id: 'client-1',
    redirect_uri: 'https://client.example/callback',
    scope: 'profile.read',
    state: 'state-123',
    code_challenge: 'challenge',
    code_challenge_method: 'S256',
  };
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    form.set(key, value);
  }
  return form;
}

function makeReq(
  form: FormData,
  headers: Headers = new Headers({ 'sec-fetch-site': 'same-origin' })
): NextRequest {
  const url = new URL('http://localhost/mcp/connect/consent');
  return {
    url: url.toString(),
    headers,
    formData: async () => form,
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClient.mockResolvedValue(client);
  mockCreateAuthorizationCode.mockResolvedValue({
    code: 'auth-code-123',
    redirectUri: 'https://client.example/callback',
  });
});

describe('POST /mcp/connect/consent', () => {
  it('rejects cross-site submissions with 403 and issues no authorization code', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'admin@royaraqamia.com' } },
    });
    mockGetSession.mockResolvedValue({
      data: { session: { refresh_token: 'refresh-token' } },
    });
    const res = (await POST(
      makeReq(
        makeForm(),
        new Headers({ 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' })
      )
    )) as NextResponse & { headers: Headers; status: number };

    expect(res.status).toBe(403);
    // No redirect to the client's callback with a code.
    expect(res.headers.get('location')).toBeNull();
    expect(mockCreateAuthorizationCode).not.toHaveBeenCalled();
  });

  it('rejects requests with no origin or sec-fetch-site signal', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'admin@royaraqamia.com' } },
    });
    mockGetSession.mockResolvedValue({
      data: { session: { refresh_token: 'refresh-token' } },
    });
    const res = (await POST(makeReq(makeForm(), new Headers()))) as NextResponse & {
      headers: Headers;
      status: number;
    };

    expect(res.status).toBe(403);
    expect(mockCreateAuthorizationCode).not.toHaveBeenCalled();
  });

  it('accepts a matching site origin and issues the authorization code', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'admin@royaraqamia.com' } },
    });
    mockGetSession.mockResolvedValue({
      data: { session: { refresh_token: 'refresh-token' } },
    });
    const res = (await POST(
      makeReq(makeForm(), new Headers({ origin: 'https://royaraqamia.com' }))
    )) as NextResponse & { headers: Headers; status: number };

    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('code=auth-code-123');
    expect(location).toContain('state=state-123');
    expect(mockCreateAuthorizationCode).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1' })
    );
  });

  it('redirects to login when the session is missing, preserving the consent query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const res = (await POST(makeReq(makeForm()))) as NextResponse & {
      headers: Headers;
      status: number;
    };
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/login');
    expect(location).toContain('redirect=%2Fmcp%2Fconnect');
    const redirectParam = decodeURIComponent(new URL(location).searchParams.get('redirect') ?? '');
    expect(redirectParam).toMatch(/^\/mcp\/connect\?/);
    const consentQuery = new URL('http://localhost' + redirectParam).searchParams;
    expect(consentQuery.get('client_id')).toBe('client-1');
    expect(consentQuery.get('redirect_uri')).toBe('https://client.example/callback');
    expect(consentQuery.get('state')).toBe('state-123');
  });
});
