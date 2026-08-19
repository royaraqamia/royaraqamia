import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authenticateMcpRequest, extractBearerToken } from '../mcp-auth';
import type { McpUserContext } from '@/backend/services/mcp/session';

const mockResolve = vi.fn();
vi.mock('@/backend/services/mcp/session', () => ({
  resolveMcpContext: (...args: unknown[]) => mockResolve(...args),
}));

vi.mock('@/backend/config/env', () => ({
  env: { baseUrl: 'https://royaraqamia.com' },
}));

const validCtx: McpUserContext = {
  userId: 'user-1',
  email: 'user@example.com',
  isAdmin: true,
  scopes: ['blog.read', 'admin'],
  clientId: 'client-1',
  tokenExpiresAt: 1780000000000,
  supabase: {} as never,
};

const anonymousCtx: McpUserContext = {
  userId: null,
  email: null,
  isAdmin: false,
  scopes: [],
  clientId: null,
  tokenExpiresAt: null,
  supabase: {} as never,
};

function makeRequest(authorization: string | null, url = 'https://royaraqamia.com/mcp'): Request {
  const headers = new Headers();
  if (authorization) headers.set('authorization', authorization);
  return new Request(url, { method: 'POST', headers });
}

describe('authenticateMcpRequest', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('challenges anonymous callers with a 401 WWW-Authenticate header', async () => {
    mockResolve.mockResolvedValue(anonymousCtx);

    const result = await authenticateMcpRequest(makeRequest(null) as never);

    expect(mockResolve).toHaveBeenCalledWith(null);
    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    const challenge = response.headers.get('WWW-Authenticate');
    expect(challenge).toContain('Bearer');
    expect(challenge).toContain(
      'resource_metadata="https://royaraqamia.com/.well-known/oauth-protected-resource"'
    );
    expect(challenge).toContain('scope="');
  });

  it('passes the bearer token to the resolver and builds AuthInfo', async () => {
    mockResolve.mockResolvedValue(validCtx);

    const result = await authenticateMcpRequest(makeRequest('Bearer abc123') as never);

    expect(mockResolve).toHaveBeenCalledWith('abc123');
    if (result instanceof Response) throw new Error('expected success');
    expect(result.authInfo.token).toBe('abc123');
    expect(result.authInfo.clientId).toBe('client-1');
    expect(result.authInfo.scopes).toEqual(['blog.read', 'admin']);
    expect(result.authInfo.expiresAt).toBe(1780000000);
    expect(result.authInfo.extra).toEqual({
      userId: 'user-1',
      email: 'user@example.com',
      isAdmin: true,
    });
    expect(result.ctx).toEqual(validCtx);
  });

  it('returns 401 with the OAuth challenge when a bearer token fails to resolve', async () => {
    mockResolve.mockResolvedValue(null);

    const result = await authenticateMcpRequest(makeRequest('Bearer expired') as never);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
    expect(response.headers.get('WWW-Authenticate')).toContain('scope=');
  });
});

describe('extractBearerToken', () => {
  it('extracts a valid bearer token', () => {
    expect(extractBearerToken(makeRequest('Bearer tok123') as never)).toBe('tok123');
  });

  it('returns null for missing/non-bearer auth', () => {
    expect(extractBearerToken(makeRequest(null) as never)).toBeNull();
    expect(extractBearerToken(makeRequest('Basic abc') as never)).toBeNull();
  });
});
