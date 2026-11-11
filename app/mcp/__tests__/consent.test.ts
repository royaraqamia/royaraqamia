import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextRequest, NextResponse } from 'next/server';

const mockGetClient = vi.fn();
const mockGetUser = vi.fn();
const mockMint = vi.fn();
const mockCreateAuthorizationCode = vi.fn();
const mockListConnected = vi.fn();
const mockCap = vi.fn();

vi.mock('@/backend/config/env', () => ({
  env: {
    baseUrl: 'https://royaraqamia.com',
    mcpTokenEncryptionKey: '00'.repeat(32),
    adminEmails: [],
  },
}));

vi.mock('@/backend/config/mcp', () => ({
  createDefaultMcpOAuthProvider: () => ({
    getClient: mockGetClient,
    createAuthorizationCode: mockCreateAuthorizationCode,
  }),
  createDefaultMcpConnectedAppService: () => ({ list: mockListConnected }),
}));

vi.mock('@/backend/services/mcp/bridge-session', () => ({
  createMcpBridgeSessionMinter: () => ({ mint: mockMint }),
}));

vi.mock('@/backend/config/plans', () => ({
  // The cap is one pool shared by both directions (ADR-0155), so the consent
  // route asks the gate rather than the plan's numbers: `incoming` is 0 for a
  // client that is already connected, 1 for a new one. The gate mock enforces a
  // real Free plan cap of 1 so a route that asks for the wrong `incoming` is
  // refused exactly as it would be in production.
  createPlanGate: () => ({ cap: mockCap }),
  createUsageService: () => ({
    caps: async () => ({ plan: 'free', unlimited: false, caps: { mcp_connected_apps: 1 } }),
  }),
}));

vi.mock('@/backend/config/supabase', () => ({
  createServerSupabaseClient: () => ({
    // No `getSession` on purpose: the consent route must take identity from
    // getUser() and mint its own bridge session, never read the browser's
    // refresh token. If the route reaches for it again, this mock throws.
    auth: { getUser: () => mockGetUser() },
  }),
}));

vi.mock('next/headers', () => ({
  cookies: () => ({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

import { readBridgeSession } from '@/backend/shared/mcp-token-crypto';
import { POST } from '@/app/mcp/connect/consent/route';
import { OWNED_ITEMS } from '@/shared/contracts/plans';

// The registration's row id and the public `client_id` are two different
// strings for the same client, exactly as they are in the table: token rows
// carry `id`, while the consent form submits `client_id`. A fixture that made
// them equal would hide a comparison against the wrong one.
const client = {
  id: 'df9691ae-5fd3-45bc-9662-e0a0e37616c4',
  client_id: 'SHLPL40sK8oXhwjxu9uptw',
  client_name: 'Client 1',
  redirect_uris: ['https://client.example/callback'],
  scopes: ['tools/read'],
  expires_at: null,
  client_secret_hash: null,
  created_at: '2026-08-01T00:00:00.000Z',
};

/** The Free plan's connected-app pool (ADR-0155): one slot, both directions. */
const FREE_CONNECTED_APP_CAP = 1;

/** A gate that refuses the connection after the cap, as the real one does. */
function capAt(connectedCount: number) {
  return async (_userId: string, _item: string, incoming = 1): Promise<void> => {
    if (connectedCount + incoming > FREE_CONNECTED_APP_CAP) {
      throw new Error('Reached the plan limit for connected apps');
    }
  };
}

function makeForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const base: Record<string, string> = {
    action: 'approve',
    client_id: client.client_id,
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
  mockMint.mockResolvedValue({ refreshToken: 'bridge-refresh-token' });
  mockCreateAuthorizationCode.mockResolvedValue({
    code: 'auth-code-123',
    redirectUri: 'https://client.example/callback',
  });
  mockListConnected.mockResolvedValue([]);
  mockCap.mockImplementation(capAt(0));
});

describe('POST /mcp/connect/consent', () => {
  it('rejects cross-site submissions with 403 and issues no authorization code', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'admin@royaraqamia.com' } },
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
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('rejects requests with no origin or sec-fetch-site signal', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'admin@royaraqamia.com' } },
    });
    const res = (await POST(makeReq(makeForm(), new Headers()))) as NextResponse & {
      headers: Headers;
      status: number;
    };

    expect(res.status).toBe(403);
    expect(mockCreateAuthorizationCode).not.toHaveBeenCalled();
  });

  it('mints a bridge session and issues the authorization code', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'admin@royaraqamia.com' } },
    });
    const res = (await POST(
      makeReq(makeForm(), new Headers({ origin: 'https://royaraqamia.com' }))
    )) as NextResponse & { headers: Headers; status: number };

    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('code=auth-code-123');
    expect(location).toContain('state=state-123');
    // The grant is backed by a session minted for this user, not by the
    // browser's own refresh token.
    expect(mockMint).toHaveBeenCalledWith('admin@royaraqamia.com');
    expect(mockCreateAuthorizationCode).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        sessionEnc: expect.any(String),
      })
    );
    // ...and marked as one of ours, so a later revoke may sign it out instead of
    // leaving it alive behind a disconnected grant (ADR 0023).
    const { sessionEnc } = mockCreateAuthorizationCode.mock.calls[0]![0];
    expect(readBridgeSession(sessionEnc)).toEqual({
      refreshToken: 'bridge-refresh-token',
      owned: true,
    });
  });

  it('reuses the slot when an already-connected client re-consents at the cap', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'admin@royaraqamia.com' } },
    });
    // A live grant lists the registration's *row id*, the form carries the
    // public `client_id`: the same client, two different strings.
    mockListConnected.mockResolvedValue([
      {
        clientId: client.id,
        clientName: client.client_name,
        connectedAt: '2026-08-01T00:00:00.000Z',
        lastUsedAt: null,
      },
    ]);
    mockCap.mockImplementation(capAt(FREE_CONNECTED_APP_CAP));

    const res = (await POST(
      makeReq(makeForm(), new Headers({ origin: 'https://royaraqamia.com' }))
    )) as NextResponse & { headers: Headers; status: number };

    // The form's public string is what resolves the registration...
    expect(mockGetClient).toHaveBeenCalledWith(client.client_id);
    // ...and the grant it is matched against is asked to consume no new slot.
    expect(mockCap).toHaveBeenCalledWith('u-1', OWNED_ITEMS.mcpConnectedApps, 0);
    expect(res.status).toBe(302);
    expect(res.headers.get('location') ?? '').toContain('code=auth-code-123');
  });

  it('still refuses a genuinely new client when the cap is reached', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'admin@royaraqamia.com' } },
    });
    mockListConnected.mockResolvedValue([
      {
        clientId: 'a-different-registrations-row-id',
        clientName: 'Some other client',
        connectedAt: '2026-08-01T00:00:00.000Z',
        lastUsedAt: null,
      },
    ]);
    mockCap.mockImplementation(capAt(FREE_CONNECTED_APP_CAP));

    const res = (await POST(
      makeReq(makeForm(), new Headers({ origin: 'https://royaraqamia.com' }))
    )) as NextResponse & { headers: Headers; status: number };

    expect(mockCap).toHaveBeenCalledWith('u-1', OWNED_ITEMS.mcpConnectedApps, 1);
    expect(res.status).toBe(302);
    expect(res.headers.get('location') ?? '').toContain('error=access_denied');
    expect(mockCreateAuthorizationCode).not.toHaveBeenCalled();
  });

  it('answers server_error when the bridge session cannot be minted', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'admin@royaraqamia.com' } },
    });
    mockMint.mockResolvedValue(null);
    const res = (await POST(
      makeReq(makeForm(), new Headers({ origin: 'https://royaraqamia.com' }))
    )) as NextResponse & { headers: Headers; status: number };

    expect(res.status).toBe(302);
    expect(res.headers.get('location') ?? '').toContain('error=server_error');
    expect(mockCreateAuthorizationCode).not.toHaveBeenCalled();
  });

  it('redirects to login when the session is missing, preserving the consent query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
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
    expect(consentQuery.get('client_id')).toBe(client.client_id);
    expect(consentQuery.get('redirect_uri')).toBe('https://client.example/callback');
    expect(consentQuery.get('state')).toBe('state-123');
  });
});
