import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { createMcpOAuthProvider, McpOAuthError, ACCESS_TOKEN_TTL_MS } from '../oauth-provider';

const PKCE_VERIFIER = 'verifier';
const PKCE_CHALLENGE = createHash('sha256').update(PKCE_VERIFIER, 'utf8').digest('base64url');

const mockClient = {
  id: 'client-1',
  client_id: 'client-1',
  client_secret_hash: null,
  client_name: 'Test Client',
  redirect_uris: ['http://localhost:3000/callback'],
  scopes: ['blog.read', 'blog.write'],
  created_at: '2026-01-01T00:00:00Z',
  expires_at: null,
};

const mockCodeRecord = {
  id: 'code-1',
  code_hash: 'code-hash',
  client_id: 'client-1',
  user_id: 'user-123',
  code_challenge: PKCE_CHALLENGE,
  challenge_method: 'S256',
  redirect_uri: 'http://localhost:3000/callback',
  scope: ['blog.read'],
  session_enc: 'enc-session',
  expires_at: new Date(Date.now() + 600_000).toISOString(),
  used_at: null,
};

const mockTokenRecord = {
  id: 'tok-1',
  token_hash: 'refresh-hash',
  kind: 'refresh',
  client_id: 'client-1',
  user_id: 'user-123',
  scope: ['blog.read'],
  session_enc: 'enc-session',
  refresh_token_hash: null,
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  revoked_at: null,
  last_used_at: null,
};

const mockRepo = {
  getClient: vi.fn(),
  createClient: vi.fn(),
  saveAuthCode: vi.fn(),
  getAuthCode: vi.fn(),
  markAuthCodeUsed: vi.fn(),
  createToken: vi.fn(),
  getTokenByHash: vi.fn(),
  getAccessTokenByRefreshHash: vi.fn(),
  touchTokenLastUsed: vi.fn(),
  revokeToken: vi.fn(),
  revokeAllUserTokens: vi.fn(),
  deleteExpired: vi.fn(),
};

vi.mock('@/backend/repositories/mcp/mcp-oauth-repository', () => ({
  createMcpOAuthRepository: () => mockRepo,
}));

vi.mock('@/backend/repositories/mcp/mcp-token-crypto', () => ({
  hashToken: vi.fn((t: string) => `hash-${t}`),
  generateOpaqueToken: vi.fn(() => 'opaque-token'),
  encryptSecret: vi.fn((p: string) => `enc(${p})`),
  decryptSecret: vi.fn((p: string) => `dec(${p})`),
  constantTimeEqual: vi.fn((a: string, b: string) => a === b),
}));

describe('createMcpOAuthProvider', () => {
  let provider: ReturnType<typeof createMcpOAuthProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = createMcpOAuthProvider({ repo: mockRepo as any });
  });

  describe('registerClient', () => {
    it('creates a client with hashed secret and filtered scopes', async () => {
      mockRepo.createClient.mockResolvedValue(mockClient);

      const result = await provider.registerClient({
        clientId: 'client-1',
        clientName: 'Test Client',
        redirectUris: ['http://localhost:3000/callback'],
        clientSecret: 'secret',
        scopes: ['blog.read', 'not-a-scope' as any],
      });

      expect(mockRepo.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client-1',
          clientSecretHash: 'hash-secret',
          scopes: ['blog.read'],
        })
      );
      expect(result).toEqual(mockClient);
    });
  });

  describe('createAuthorizationCode', () => {
    it('stores a hashed code and returns the plaintext code', async () => {
      const { code, redirectUri } = await provider.createAuthorizationCode({
        client: mockClient,
        redirectUri: 'http://localhost:3000/callback',
        scope: ['blog.read'],
        codeChallenge: 'challenge-abc',
        codeChallengeMethod: 'S256',
        userId: 'user-123',
        sessionEnc: 'enc-session',
      });

      expect(code).toBe('opaque-token');
      expect(redirectUri).toBe('http://localhost:3000/callback');
      expect(mockRepo.saveAuthCode).toHaveBeenCalledWith(
        expect.objectContaining({
          codeHash: 'hash-opaque-token',
          clientId: 'client-1',
          userId: 'user-123',
          scope: ['blog.read'],
        })
      );
    });
  });

  describe('verifyPkce', () => {
    it('verifies a correct S256 verifier', () => {
      const valid = provider.verifyPkce(PKCE_VERIFIER, PKCE_CHALLENGE, 'S256');
      expect(valid).toBe(true);
    });

    it('rejects missing verifier or challenge', () => {
      expect(provider.verifyPkce('', 'challenge', 'S256')).toBe(false);
      expect(provider.verifyPkce('verifier', '', 'S256')).toBe(false);
    });

    it('rejects non-S256 methods', () => {
      expect(provider.verifyPkce('verifier', 'challenge', 'plain')).toBe(false);
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('issues a token pair for a valid code', async () => {
      mockRepo.getAuthCode.mockResolvedValue(mockCodeRecord);
      mockRepo.createToken.mockResolvedValue(undefined);

      const response = await provider.exchangeCodeForTokens({
        code: 'code-1',
        codeVerifier: PKCE_VERIFIER,
        client: mockClient,
        redirectUri: 'http://localhost:3000/callback',
      });

      expect(mockRepo.markAuthCodeUsed).toHaveBeenCalledWith('code-1');
      expect(response).toEqual({
        access_token: 'opaque-token',
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_MS / 1000,
        refresh_token: 'opaque-token',
        scope: 'blog.read',
      });
    });

    it('rejects an already-used code', async () => {
      mockRepo.getAuthCode.mockResolvedValue({
        ...mockCodeRecord,
        used_at: '2026-01-01T00:00:00Z',
      });

      await expect(
        provider.exchangeCodeForTokens({
          code: 'code-1',
          codeVerifier: 'verifier',
          client: mockClient,
          redirectUri: 'http://localhost:3000/callback',
        })
      ).rejects.toThrow(McpOAuthError);
    });

    it('rejects an expired code', async () => {
      mockRepo.getAuthCode.mockResolvedValue({
        ...mockCodeRecord,
        expires_at: new Date(Date.now() - 600_000).toISOString(),
      });

      await expect(
        provider.exchangeCodeForTokens({
          code: 'code-1',
          codeVerifier: 'verifier',
          client: mockClient,
          redirectUri: 'http://localhost:3000/callback',
        })
      ).rejects.toThrow(McpOAuthError);
    });

    it('rejects a mismatched redirect_uri', async () => {
      mockRepo.getAuthCode.mockResolvedValue(mockCodeRecord);

      await expect(
        provider.exchangeCodeForTokens({
          code: 'code-1',
          codeVerifier: 'verifier',
          client: mockClient,
          redirectUri: 'http://evil.com/callback',
        })
      ).rejects.toThrow(McpOAuthError);
    });
  });

  describe('refreshAccessToken', () => {
    it('rotates the token pair', async () => {
      mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);
      mockRepo.getAccessTokenByRefreshHash.mockResolvedValue({
        ...mockTokenRecord,
        id: 'tok-access',
        kind: 'access',
        refresh_token_hash: 'hash-refresh',
      });

      const response = await provider.refreshAccessToken({
        refreshToken: 'refresh-1',
        client: mockClient,
      });

      expect(mockRepo.revokeToken).toHaveBeenCalledWith('tok-1');
      expect(mockRepo.revokeToken).toHaveBeenCalledWith('tok-access');
      expect(response.refresh_token).toBe('opaque-token');
    });

    it('rejects a revoked refresh token', async () => {
      mockRepo.getTokenByHash.mockResolvedValue({
        ...mockTokenRecord,
        revoked_at: '2026-01-01T00:00:00Z',
      });

      await expect(
        provider.refreshAccessToken({ refreshToken: 'refresh-1', client: mockClient })
      ).rejects.toThrow(McpOAuthError);
    });

    it('rejects a missing refresh token', async () => {
      mockRepo.getTokenByHash.mockResolvedValue(null);

      await expect(
        provider.refreshAccessToken({ refreshToken: 'refresh-1', client: mockClient })
      ).rejects.toThrow(McpOAuthError);
    });
  });

  describe('verifyAccessToken', () => {
    it('returns token info for a valid access token', async () => {
      mockRepo.getTokenByHash.mockResolvedValue({
        ...mockTokenRecord,
        kind: 'access',
      });

      const result = await provider.verifyAccessToken('access-token');

      expect(result).toEqual({
        clientId: 'client-1',
        userId: 'user-123',
        scopes: ['blog.read'],
        expiresAt: expect.any(Date),
      });
    });

    it('returns null for a revoked token', async () => {
      mockRepo.getTokenByHash.mockResolvedValue({
        ...mockTokenRecord,
        kind: 'access',
        revoked_at: '2026-01-01T00:00:00Z',
      });

      expect(await provider.verifyAccessToken('access-token')).toBeNull();
    });

    it('returns null for a refresh token (not an access token)', async () => {
      mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);

      expect(await provider.verifyAccessToken('refresh-token')).toBeNull();
    });

    it('returns null for an unknown token', async () => {
      mockRepo.getTokenByHash.mockResolvedValue(null);
      expect(await provider.verifyAccessToken('nope')).toBeNull();
    });
  });

  describe('revokeToken', () => {
    it('revokes the token', async () => {
      mockRepo.getTokenByHash.mockResolvedValue(mockTokenRecord);

      await provider.revokeToken({ token: 'refresh-1', client: mockClient });

      expect(mockRepo.revokeToken).toHaveBeenCalledWith('tok-1');
    });

    it('silently succeeds for an unknown token', async () => {
      mockRepo.getTokenByHash.mockResolvedValue(null);

      await expect(
        provider.revokeToken({ token: 'nope', client: mockClient })
      ).resolves.toBeUndefined();
    });
  });

  describe('revokeAllUserTokens', () => {
    it('revokes all tokens for a user', async () => {
      await provider.revokeAllUserTokens('user-123');
      expect(mockRepo.revokeAllUserTokens).toHaveBeenCalledWith('user-123');
    });
  });
});
