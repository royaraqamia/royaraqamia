import { createHash } from 'node:crypto';
import {
  createMcpOAuthRepository,
  type McpOAuthClientRecord,
  type McpOAuthRepository,
} from '@/backend/repositories/mcp/mcp-oauth-repository';
import {
  constantTimeEqual,
  generateOpaqueToken,
  hashToken,
} from '@/backend/repositories/mcp/mcp-token-crypto';
import { ALL_SCOPES, type McpScope } from './scope';

/**
 * OAuth 2.1 authorization-server logic for the public MCP server.
 *
 * Pure business logic — no HTTP. Route handlers in `app/mcp/*` are thin
 * adapters that parse requests, call one provider method, and map
 * `McpOAuthError` to JSON responses.
 *
 * Supported grants: authorization-code with PKCE (S256) and refresh-token
 * rotation. Clients may be confidential (client_secret) or public (PKCE-only).
 * All secrets are stored SHA-256-hashed; the user's Supabase refresh token is
 * held AES-256-GCM-encrypted in `session_enc` (see mcp-token-crypto).
 */

export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type McpOAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_scope'
  | 'unauthorized_client'
  | 'unsupported_response_type'
  | 'unsupported_grant_type'
  | 'access_denied'
  | 'server_error';

export class McpOAuthError extends Error {
  readonly status: number;
  readonly code: McpOAuthErrorCode;
  readonly errorDescription: string;

  constructor(status: number, code: McpOAuthErrorCode, errorDescription: string) {
    super(errorDescription);
    this.name = 'McpOAuthError';
    this.status = status;
    this.code = code;
    this.errorDescription = errorDescription;
  }
}

export interface McpOAuthProviderDeps {
  repo?: McpOAuthRepository;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface VerifiedAccessToken {
  clientId: string;
  userId: string;
  scopes: McpScope[];
  expiresAt: Date;
}

export interface McpOAuthProvider {
  /** Register a first-party or dynamic OAuth client (RFC 7591 subset). */
  registerClient(input: {
    clientId: string;
    clientName: string | null;
    redirectUris: string[];
    clientSecret?: string;
    scopes?: McpScope[];
    expiresAt?: Date | null;
  }): Promise<McpOAuthClientRecord>;

  /** Validate an authorization request and persist an auth code. */
  createAuthorizationCode(input: {
    client: McpOAuthClientRecord;
    redirectUri: string;
    scope: McpScope[];
    codeChallenge: string | null;
    codeChallengeMethod: string | null;
    userId: string;
    sessionEnc: string | null;
  }): Promise<{ code: string; redirectUri: string }>;

  /** Verify a PKCE code_verifier against the stored challenge (S256). */
  verifyPkce(codeVerifier: string, storedChallenge: string, method: string): boolean;

  /** Exchange an authorization code for access + refresh tokens. */
  exchangeCodeForTokens(input: {
    code: string;
    codeVerifier: string;
    client: McpOAuthClientRecord;
    redirectUri: string;
    clientSecret?: string;
  }): Promise<TokenResponse>;

  /** Rotate a refresh token into a fresh access + refresh pair. */
  refreshAccessToken(input: {
    refreshToken: string;
    client: McpOAuthClientRecord;
    clientSecret?: string;
  }): Promise<TokenResponse>;

  /** Validate a bearer access token for the MCP resource server. */
  verifyAccessToken(bearerToken: string): Promise<VerifiedAccessToken | null>;

  /** Revoke an access or refresh token (RFC 7009). */
  revokeToken(input: {
    token: string;
    client: McpOAuthClientRecord;
    clientSecret?: string;
  }): Promise<void>;

  /** Revoke every session a user has issued (sign out everywhere). */
  revokeAllUserTokens(userId: string): Promise<void>;
}

export function createMcpOAuthProvider(deps: McpOAuthProviderDeps = {}): McpOAuthProvider {
  const repo = deps.repo ?? createMcpOAuthRepository();

  return {
    async registerClient(input) {
      const requested = input.scopes ?? [];
      const scopes = requested.filter((s): s is McpScope => ALL_SCOPES.includes(s));
      const expiresAt = input.expiresAt === undefined ? null : input.expiresAt;
      return repo.createClient({
        clientId: input.clientId,
        clientSecretHash: input.clientSecret ? hashToken(input.clientSecret) : null,
        clientName: input.clientName,
        redirectUris: input.redirectUris,
        scopes,
        expiresAt,
      });
    },

    async createAuthorizationCode(input) {
      const code = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS);
      await repo.saveAuthCode({
        codeHash: hashToken(code),
        clientId: input.client.id,
        userId: input.userId,
        codeChallenge: input.codeChallenge ?? '',
        challengeMethod: input.codeChallengeMethod ?? 'S256',
        redirectUri: input.redirectUri,
        scope: input.scope,
        sessionEnc: input.sessionEnc,
        expiresAt,
      });
      return { code, redirectUri: input.redirectUri };
    },

    verifyPkce,

    async exchangeCodeForTokens(input) {
      if (input.client.expires_at && new Date(input.client.expires_at).getTime() < Date.now()) {
        throw new McpOAuthError(400, 'invalid_client', 'Client registration has expired');
      }
      authenticateClient(input.client, input.clientSecret);

      const codeHash = hashToken(input.code);
      const codeRow = await repo.getAuthCode(codeHash);
      if (!codeRow || codeRow.used_at) {
        throw new McpOAuthError(
          400,
          'invalid_grant',
          'Authorization code is invalid or already used'
        );
      }
      if (new Date(codeRow.expires_at).getTime() < Date.now()) {
        throw new McpOAuthError(400, 'invalid_grant', 'Authorization code has expired');
      }
      if (codeRow.client_id !== input.client.id) {
        throw new McpOAuthError(
          400,
          'invalid_grant',
          'Authorization code was issued to another client'
        );
      }
      if (codeRow.redirect_uri !== input.redirectUri) {
        throw new McpOAuthError(
          400,
          'invalid_grant',
          'redirect_uri does not match the authorization request'
        );
      }
      if (!verifyPkce(input.codeVerifier, codeRow.code_challenge, codeRow.challenge_method)) {
        throw new McpOAuthError(400, 'invalid_grant', 'PKCE verification failed');
      }

      await repo.markAuthCodeUsed(codeRow.id);

      return issueTokenPair(repo, {
        client: input.client,
        userId: codeRow.user_id,
        scopes: codeRow.scope as McpScope[],
        sessionEnc: codeRow.session_enc,
      });
    },

    async refreshAccessToken(input) {
      if (input.client.expires_at && new Date(input.client.expires_at).getTime() < Date.now()) {
        throw new McpOAuthError(400, 'invalid_client', 'Client registration has expired');
      }
      authenticateClient(input.client, input.clientSecret);

      const refreshHash = hashToken(input.refreshToken);
      const refreshRow = await repo.getTokenByHash(refreshHash);
      if (!refreshRow || refreshRow.kind !== 'refresh') {
        throw new McpOAuthError(400, 'invalid_grant', 'Refresh token is invalid');
      }
      if (refreshRow.revoked_at) {
        throw new McpOAuthError(400, 'invalid_grant', 'Refresh token has been revoked');
      }
      if (new Date(refreshRow.expires_at).getTime() < Date.now()) {
        throw new McpOAuthError(400, 'invalid_grant', 'Refresh token has expired');
      }
      if (refreshRow.client_id !== input.client.id) {
        throw new McpOAuthError(400, 'invalid_grant', 'Refresh token was issued to another client');
      }

      const accessRow = await repo.getAccessTokenByRefreshHash(refreshHash);
      if (!accessRow) {
        throw new McpOAuthError(
          400,
          'invalid_grant',
          'Refresh token is not paired with an access token'
        );
      }

      // Rotation: revoke the old pair, then issue a brand-new pair.
      await repo.revokeToken(refreshRow.id);
      await repo.revokeToken(accessRow.id);

      return issueTokenPair(repo, {
        client: input.client,
        userId: accessRow.user_id,
        scopes: accessRow.scope as McpScope[],
        sessionEnc: accessRow.session_enc,
      });
    },

    async verifyAccessToken(bearerToken) {
      if (!bearerToken) return null;
      const tokenRow = await repo.getTokenByHash(hashToken(bearerToken));
      if (!tokenRow || tokenRow.kind !== 'access') return null;
      if (tokenRow.revoked_at) return null;
      const expiresAt = new Date(tokenRow.expires_at);
      if (expiresAt.getTime() < Date.now()) return null;
      return {
        clientId: tokenRow.client_id,
        userId: tokenRow.user_id,
        scopes: tokenRow.scope as McpScope[],
        expiresAt,
      };
    },

    async revokeToken(input) {
      authenticateClient(input.client, input.clientSecret);
      const row = await repo.getTokenByHash(hashToken(input.token));
      if (!row) return; // unknown token: revoke succeeds silently (RFC 7009)
      if (row.client_id !== input.client.id) {
        throw new McpOAuthError(400, 'invalid_grant', 'Token was issued to another client');
      }
      await repo.revokeToken(row.id);
      if (row.kind === 'refresh') {
        const accessRow = await repo.getAccessTokenByRefreshHash(row.token_hash);
        if (accessRow) await repo.revokeToken(accessRow.id);
      }
    },

    async revokeAllUserTokens(userId) {
      await repo.revokeAllUserTokens(userId);
      return Promise.resolve();
    },
  };
}

function authenticateClient(client: McpOAuthClientRecord, clientSecret?: string): void {
  if (!client.client_secret_hash) return; // public client (PKCE is required)
  if (!clientSecret) {
    throw new McpOAuthError(401, 'invalid_client', 'Client authentication required');
  }
  if (!constantTimeEqual(hashToken(clientSecret), client.client_secret_hash)) {
    throw new McpOAuthError(401, 'invalid_client', 'Client authentication failed');
  }
}

export function verifyPkce(codeVerifier: string, storedChallenge: string, method: string): boolean {
  if (!storedChallenge || !codeVerifier) return false;
  if ((method ?? 'S256').toUpperCase() !== 'S256') return false;
  const digest = createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
  return constantTimeEqual(digest, storedChallenge);
}

async function issueTokenPair(
  repo: McpOAuthRepository,
  input: {
    client: McpOAuthClientRecord;
    userId: string;
    scopes: McpScope[];
    sessionEnc: string | null;
  }
): Promise<TokenResponse> {
  const accessToken = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();
  const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await repo.createToken({
    tokenHash: hashToken(accessToken),
    kind: 'access',
    clientId: input.client.id,
    userId: input.userId,
    scope: input.scopes,
    sessionEnc: input.sessionEnc,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: accessExpiresAt,
  });
  await repo.createToken({
    tokenHash: hashToken(refreshToken),
    kind: 'refresh',
    clientId: input.client.id,
    userId: input.userId,
    scope: input.scopes,
    sessionEnc: input.sessionEnc,
    refreshTokenHash: null,
    expiresAt: refreshExpiresAt,
  });

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: input.scopes.join(' '),
  };
}
