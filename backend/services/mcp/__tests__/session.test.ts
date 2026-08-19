import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveMcpContext, invalidateTokenCache, clearAllTokenCache } from '../session';
import type { McpTokenRecord } from '@/backend/repositories/mcp/mcp-oauth-repository';

const mockTokenRecord: McpTokenRecord = {
  id: 'tok-123',
  token_hash: 'abc123',
  kind: 'access',
  client_id: 'client-1',
  user_id: 'user-123',
  scope: ['blog.read', 'linksnap.read'],
  session_enc: 'encrypted-refresh-token',
  refresh_token_hash: 'refresh-hash',
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
  revoked_at: null,
  last_used_at: null,
};

const mockRepo = {
  getTokenByHash: vi.fn(),
  touchTokenLastUsed: vi.fn(),
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
}));

// Mock supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      setSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'fresh-access-token',
            refresh_token: 'supabase-refresh-token',
          },
        },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
        error: null,
      }),
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
    expect(ctx!.scopes).toEqual(['blog.read', 'linksnap.read']);
    expect(ctx!.supabase).toBeDefined();
    expect(mockRepo.touchTokenLastUsed).toHaveBeenCalledWith('tok-123');
  });

  it('caches the context and returns cached on second call', async () => {
    mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);

    await resolveMcpContext('valid-token');
    await resolveMcpContext('valid-token');

    // repo.getTokenByHash should only be called once due to caching
    expect(mockRepo.getTokenByHash).toHaveBeenCalledTimes(1);
  });

  it('respects admin gating: admin scope stripped if user not in ADMIN_EMAILS', async () => {
    const adminToken = { ...mockTokenRecord, scope: ['blog.read', 'admin'] };
    mockRepo.getTokenByHash.mockResolvedValue(adminToken);

    const ctx = await resolveMcpContext('admin-token');
    expect(ctx!.scopes).toEqual(['blog.read']);
    expect(ctx!.isAdmin).toBe(false);
  });
});

describe('invalidateTokenCache', () => {
  it('clears the cache for a token', async () => {
    mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);

    await resolveMcpContext('token');
    invalidateTokenCache('hash-x');
    await resolveMcpContext('token');

    // Should call repo twice since cache was invalidated
    expect(mockRepo.getTokenByHash).toHaveBeenCalledTimes(2);
  });
});
