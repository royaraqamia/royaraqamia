import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveMcpContext,
  invalidateTokenCache,
  invalidateUserCache,
  clearAllTokenCache,
  isBridgeSessionDead,
} from '../session';
import type { McpTokenRecord } from '@/backend/repositories/mcp/mcp-oauth-repository';

const mockTokenRecord: McpTokenRecord = {
  id: 'tok-123',
  token_hash: 'abc123',
  kind: 'access',
  client_id: 'client-1',
  user_id: 'user-123',
  scope: ['community.read', 'linksnap.read'],
  session_enc: 'encrypted-refresh-token',
  refresh_token_hash: 'refresh-hash',
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
  revoked_at: null,
  last_used_at: null,
};

const supabaseMocks = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  getUser: vi.fn(),
}));

const mockRepo = {
  getTokenByHash: vi.fn(),
  touchTokenLastUsed: vi.fn(),
  updateTokenSessionEnc: vi.fn(),
  revokeToken: vi.fn(),
};

// Mock the oauth repository module
vi.mock('@/backend/repositories/mcp/mcp-oauth-repository', () => ({
  createMcpOAuthRepository: () => mockRepo,
  McpOAuthRepository: {} as any,
}));

// Mock token crypto
vi.mock('@/backend/repositories/mcp/mcp-token-crypto', () => ({
  hashToken: vi.fn((t: string) => `hash-${t}`),
  decryptSecret: vi.fn((enc: string) => {
    if (enc === 'encrypted-refresh-token') return 'supabase-refresh-token';
    throw new Error('decrypt failed');
  }),
  encryptSecret: vi.fn((t: string) => `enc-${t}`),
}));

// Mock supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      refreshSession: supabaseMocks.refreshSession,
      getUser: supabaseMocks.getUser,
    },
    from: vi.fn(),
  })),
}));

// Mock env
vi.mock('@/backend/config/env', () => ({
  env: {
    supabaseUrl: 'https://test.supabase.co',
    supabasePublishableKey: 'test-key',
    adminEmails: ['admin@example.com'],
    mcpTokenEncryptionKey: 'a'.repeat(64),
  },
}));

// Mock admin validator
vi.mock('@/backend/shared/admin-validator', () => ({
  parseAdminEmails: (raw: string) => raw.split(',').map((e) => e.trim().toLowerCase()),
  isAdmin: (email: string, emails: string[]) => emails.includes(email.toLowerCase()),
}));

describe('resolveMcpContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllTokenCache();
    supabaseMocks.refreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'fresh-access-token',
          refresh_token: 'rotated-refresh-token',
        },
      },
      error: null,
    });
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'user@example.com' } },
      error: null,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns anonymous context for null/undefined token', async () => {
    const ctx = await resolveMcpContext(null);
    expect(ctx).not.toBeNull();
    expect(ctx!.userId).toBeNull();
    expect(ctx!.scopes).toEqual([]);
    expect(ctx!.isAdmin).toBe(false);
  });

  it('returns null for unknown token', async () => {
    mockRepo.getTokenByHash.mockResolvedValue(null);

    const ctx = await resolveMcpContext('unknown-token');
    expect(ctx).toBeNull();
  });

  it('returns null for revoked token', async () => {
    const revokedToken = { ...mockTokenRecord, revoked_at: '2026-01-01T00:00:00Z' };
    mockRepo.getTokenByHash.mockResolvedValue(revokedToken);

    const ctx = await resolveMcpContext('revoked-token');
    expect(ctx).toBeNull();
  });

  it('returns null for expired token', async () => {
    const expiredToken = { ...mockTokenRecord, expires_at: '2025-01-01T00:00:00Z' };
    mockRepo.getTokenByHash.mockResolvedValue(expiredToken);

    const ctx = await resolveMcpContext('expired-token');
    expect(ctx).toBeNull();
  });

  it('returns valid context for a good token', async () => {
    mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);

    const ctx = await resolveMcpContext('valid-token');

    expect(ctx).not.toBeNull();
    expect(ctx!.userId).toBe('user-123');
    expect(ctx!.email).toBe('user@example.com');
    expect(ctx!.isAdmin).toBe(false);
    expect(ctx!.scopes).toEqual(['community.read', 'linksnap.read']);
    expect(ctx!.supabase).toBeDefined();
    expect(mockRepo.touchTokenLastUsed).toHaveBeenCalledWith('tok-123');
    expect(mockRepo.updateTokenSessionEnc).toHaveBeenCalledWith(
      'tok-123',
      'enc-rotated-refresh-token'
    );
  });

  it('caches the context and returns cached on second call', async () => {
    mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);

    await resolveMcpContext('valid-token');
    await resolveMcpContext('valid-token');

    // repo.getTokenByHash should only be called once due to caching
    expect(mockRepo.getTokenByHash).toHaveBeenCalledTimes(1);
  });

  it('respects admin gating: admin scope stripped if user not in ADMIN_EMAILS', async () => {
    const adminToken = { ...mockTokenRecord, scope: ['community.read', 'admin'] };
    mockRepo.getTokenByHash.mockResolvedValue(adminToken);

    const ctx = await resolveMcpContext('admin-token');
    expect(ctx!.scopes).toEqual(['community.read']);
    expect(ctx!.isAdmin).toBe(false);
  });

  it('revokes the grant when the bridge session is dead, so the client re-authorizes', async () => {
    const refreshRow: McpTokenRecord = {
      ...mockTokenRecord,
      id: 'refresh-456',
      kind: 'refresh',
      token_hash: 'refresh-hash',
      refresh_token_hash: null,
    };
    mockRepo.getTokenByHash
      .mockResolvedValueOnce(mockTokenRecord)
      .mockResolvedValueOnce(refreshRow);
    supabaseMocks.refreshSession.mockResolvedValue({
      data: { session: null },
      error: {
        name: 'AuthApiError',
        status: 400,
        code: 'refresh_token_already_used',
        message: 'Invalid Refresh Token: Already Used',
      },
    });

    expect(await resolveMcpContext('valid-token')).toBeNull();

    // Access row and its refresh row are both retired, so the client's next
    // /mcp/token refresh answers invalid_grant and restarts the browser flow
    // instead of looping on 401.
    expect(mockRepo.revokeToken).toHaveBeenCalledWith('tok-123');
    expect(mockRepo.revokeToken).toHaveBeenCalledWith('refresh-456');
  });

  it('keeps the credentials when the session refresh fails transiently', async () => {
    mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);
    supabaseMocks.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { name: 'AuthApiError', status: 503, message: 'Service Unavailable' },
    });

    expect(await resolveMcpContext('valid-token')).toBeNull();
    expect(mockRepo.revokeToken).not.toHaveBeenCalled();
  });

  it('revokes the grant when the stored bridge token cannot be decrypted', async () => {
    mockRepo.getTokenByHash.mockResolvedValue({
      ...mockTokenRecord,
      session_enc: 'encrypted-with-a-rotated-key',
    });

    expect(await resolveMcpContext('valid-token')).toBeNull();
    expect(mockRepo.revokeToken).toHaveBeenCalledWith('tok-123');
  });
});

describe('isBridgeSessionDead', () => {
  it.each([
    ['refresh_token_already_used', 400],
    ['refresh_token_not_found', 400],
    ['session_expired', 403],
    ['user_banned', 403],
  ])('treats %s as a dead bridge session', (code, status) => {
    expect(isBridgeSessionDead({ code, status, message: 'anything' })).toBe(true);
  });

  it('never treats a transient or configuration failure as dead', () => {
    expect(
      isBridgeSessionDead({ code: 'invalid_api_key', status: 401, message: 'Invalid API key' })
    ).toBe(false);
    expect(isBridgeSessionDead({ status: 503, message: 'Service Unavailable' })).toBe(false);
    expect(isBridgeSessionDead({ status: 429, message: 'Too many requests' })).toBe(false);
    expect(isBridgeSessionDead(undefined)).toBe(false);
    expect(isBridgeSessionDead(new Error('fetch failed'))).toBe(false);
  });

  it('falls back to a bare 400 that names the refresh token', () => {
    expect(isBridgeSessionDead({ status: 400, message: 'Invalid Refresh Token' })).toBe(true);
    expect(isBridgeSessionDead({ status: 400, message: 'Bad Request' })).toBe(false);
  });
});

describe('invalidateTokenCache', () => {
  it('clears the cache for a token', async () => {
    mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);

    await resolveMcpContext('token');
    invalidateTokenCache('hash-token');
    await resolveMcpContext('token');

    // Should call repo twice since cache was invalidated
    expect(mockRepo.getTokenByHash).toHaveBeenCalledTimes(2);
  });

  it('rejects a token revoked after it was cached, without waiting for the TTL', async () => {
    mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);
    expect(await resolveMcpContext('token')).not.toBeNull();

    // Simulate POST /mcp/revoke: the row is now revoked and the cache entry is
    // dropped, so the very next request re-reads the DB instead of the cache.
    mockRepo.getTokenByHash.mockResolvedValue({
      ...mockTokenRecord,
      revoked_at: '2026-01-01T00:00:00Z',
    });
    invalidateTokenCache('hash-token');

    expect(await resolveMcpContext('token')).toBeNull();
  });
});

describe('invalidateUserCache', () => {
  it('clears cached contexts for the user, forcing a re-read', async () => {
    mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);

    await resolveMcpContext('token');
    invalidateUserCache('user-123');
    await resolveMcpContext('token');

    expect(mockRepo.getTokenByHash).toHaveBeenCalledTimes(2);
  });
});
