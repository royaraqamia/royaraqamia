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
  isAccessTokenLive: vi.fn(),
  touchTokenLastUsed: vi.fn(),
  updateTokenSessionEnc: vi.fn(),
  revokeToken: vi.fn(),
};

// Mock the oauth repository module
vi.mock('@/backend/repositories/mcp/mcp-oauth-repository', () => ({
  createMcpOAuthRepository: () => mockRepo,
  McpOAuthRepository: {} as any,
}));

// Mock token crypto. `readBridgeSession` mirrors the real marker: a ciphertext
// the mint path wrote reads as ours, any other row reads as borrowed.
vi.mock('@/backend/repositories/mcp/mcp-token-crypto', () => ({
  hashToken: vi.fn((t: string) => `hash-${t}`),
  readBridgeSession: vi.fn((enc: string) => {
    if (enc === 'encrypted-refresh-token') {
      return { refreshToken: 'supabase-refresh-token', owned: true };
    }
    if (enc === 'borrowed-browser-session') {
      return { refreshToken: 'supabase-refresh-token', owned: false };
    }
    throw new Error('decrypt failed');
  }),
  encryptBridgeSession: vi.fn((t: string) => `bridge-${t}`),
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

vi.mock('@/backend/shared/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { logger } from '@/backend/shared/logger';

/**
 * Every test starts from an empty context cache: an entry left behind by an
 * earlier test is live under these tests' real (or mocked) clock and would be
 * indistinguishable from a fresh resolve in the ones that only count DB reads.
 */
beforeEach(() => {
  clearAllTokenCache();
});

describe('resolveMcpContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo.isAccessTokenLive.mockResolvedValue(true);
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
    // Re-encrypted with the ownership marker intact, or a later revoke would
    // leave this session running (ADR 0023).
    expect(mockRepo.updateTokenSessionEnc).toHaveBeenCalledWith(
      'tok-123',
      'bridge-rotated-refresh-token'
    );
  });

  it('keeps a borrowed bridge session unmarked when it re-encrypts the rotation', async () => {
    mockRepo.getTokenByHash.mockResolvedValue({
      ...mockTokenRecord,
      session_enc: 'borrowed-browser-session',
    });

    const ctx = await resolveMcpContext('valid-token');

    // A pre-amendment row still drains — it is a usable session — but rotating it
    // must not stamp "this session is ours" onto the user's browser session.
    expect(ctx).not.toBeNull();
    expect(mockRepo.updateTokenSessionEnc).toHaveBeenCalledWith(
      'tok-123',
      'enc-rotated-refresh-token'
    );
  });

  it('reuses the cached client on the happy path while re-checking the row', async () => {
    mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);

    const first = await resolveMcpContext('valid-token');
    const second = await resolveMcpContext('valid-token');

    // The expensive part — the user-scoped Supabase client — is built once...
    expect(supabaseMocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(mockRepo.getTokenByHash).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    // ...because what authorizes the second request is the row, not the entry.
    expect(mockRepo.isAccessTokenLive).toHaveBeenCalledTimes(1);
    expect(mockRepo.isAccessTokenLive).toHaveBeenCalledWith('hash-valid-token', expect.any(Date));
  });

  /**
   * The cache is process-local and the MCP routes are serverless functions, so a
   * revoke/rotate served by one instance is invisible to every other warm one.
   * These tests never call an invalidator: the DB row alone has to refuse the
   * token, which is the only thing a sibling instance can rely on.
   */
  it('rejects a token another instance revoked, without this instance clearing its cache', async () => {
    mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);
    expect(await resolveMcpContext('valid-token')).not.toBeNull();

    // A sibling instance served POST /mcp/revoke: the row flipped and only *that*
    // instance's Map was cleared. This one's entry is untouched and stale.
    mockRepo.isAccessTokenLive.mockResolvedValue(false);
    mockRepo.getTokenByHash.mockResolvedValue({
      ...mockTokenRecord,
      revoked_at: '2026-01-01T00:00:00Z',
    });

    expect(await resolveMcpContext('valid-token')).toBeNull();
    expect(await resolveMcpContext('valid-token')).toBeNull();
    // The dead entry was dropped, so the third call takes the full path again.
    expect(mockRepo.isAccessTokenLive).toHaveBeenCalledTimes(1);
    expect(mockRepo.getTokenByHash).toHaveBeenCalledTimes(2);
  });

  it('rejects a bearer whose row is gone — rotation or sweep — even while cached', async () => {
    mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);
    expect(await resolveMcpContext('valid-token')).not.toBeNull();

    // Rotation revoked the superseded access row and the daily sweep deleted it;
    // the retired bearer still has a cached context on this instance.
    mockRepo.isAccessTokenLive.mockResolvedValue(false);

    expect(await resolveMcpContext('valid-token')).toBeNull();
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
    // ...and the retirement is countable in the logs, with its reason.
    expect(logger.warn).toHaveBeenCalledWith(
      '[MCP:SESSION] retired a dead bridge grant',
      expect.objectContaining({ reason: 'rejected', userId: 'user-123' })
    );
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
    expect(logger.warn).toHaveBeenCalledWith(
      '[MCP:SESSION] retired a dead bridge grant',
      expect.objectContaining({ reason: 'undecryptable' })
    );
  });

  it('retires a grant that carries no session at all', async () => {
    mockRepo.getTokenByHash.mockResolvedValue({ ...mockTokenRecord, session_enc: null });

    expect(await resolveMcpContext('valid-token')).toBeNull();
    expect(mockRepo.revokeToken).toHaveBeenCalledWith('tok-123');
    expect(logger.warn).toHaveBeenCalledWith(
      '[MCP:SESSION] retired a dead bridge grant',
      expect.objectContaining({ reason: 'no-session' })
    );
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

  it('force-rebuilds the context instead of probing the dropped entry', async () => {
    mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);

    await resolveMcpContext('token');
    invalidateTokenCache('hash-token');
    await resolveMcpContext('token');

    // A dropped entry is rebuilt from scratch, client and all: the invalidators
    // are a local optimization on top of the per-request row check, never the
    // thing that makes a revocation stick.
    expect(supabaseMocks.refreshSession).toHaveBeenCalledTimes(2);
    expect(mockRepo.isAccessTokenLive).not.toHaveBeenCalled();
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
