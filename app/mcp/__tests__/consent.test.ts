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
    scope: 'tools/read',
    state: 'state-123',
    code_challenge: 'challenge',
    code_challenge_method: 'S256',
  };
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    form.set(key, value);
  }
  return form;
}

function makeReq(form: FormData): NextRequest {
  const url = new URL('http://localhost/mcp/connect/consent');
  return {
    url: url.toString(),
    formData: async () => form,
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClient.mockResolvedValue(client);
});

describe('POST /mcp/connect/consent', () => {
  it('redirects to login when the session is missing, preserving the consent query', async () => {
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
