import { createHash } from 'node:crypto';
import {
  createMcpOAuthRepository,
  type McpOAuthClientRecord,
  type McpOAuthRepository,
  type McpUserGrantRecord,
} from '@/backend/repositories/mcp/mcp-oauth-repository';
import {
  constantTimeEqual,
  generateOpaqueToken,
  hashToken,
  readBridgeSession,
} from '@/backend/repositories/mcp/mcp-token-crypto';
import { createMcpBridgeSessionRevoker, type McpBridgeSessionRevoker } from './bridge-session';
import { ALL_SCOPES, type McpScope } from './scope';
import { invalidateTokenCache, invalidateUserCache } from './token-cache';

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
  /** Signs out the grant's own minted bridge sessions when a live revoke strands them. */
  bridgeSessions?: McpBridgeSessionRevoker;
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

/**
 * Redirect-URI scheme policy for registered MCP clients (ADR 0022): https
 * only, except http loopback hosts for local development. Native-app and
 * other non-web schemes are rejected at registration so the authorize step
 * never has to re-litigate them.
 */
export function isValidMcpRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol === 'http:') {
    // URL.hostname keeps IPv6 brackets ("[::1]"), strip them for the comparison.
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  }
  return false;
}

export interface McpOAuthProvider {
  /** Load a registered OAuth client by its public client_id. */
  getClient(clientId: string): Promise<McpOAuthClientRecord | null>;

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

  /**
   * Rotate a refresh token into a fresh access + refresh pair. Single-use: the
   * presented refresh row is claimed atomically, so overlapping refreshes yield
   * exactly one pair and every other caller is answered `invalid_grant`.
   */
  refreshAccessToken(input: {
    refreshToken: string;
    client: McpOAuthClientRecord;
    clientSecret?: string;
  }): Promise<TokenResponse>;

  /** Validate a bearer access token for the MCP resource server. */
  verifyAccessToken(bearerToken: string): Promise<VerifiedAccessToken | null>;

  /**
   * Revoke an access or refresh token (RFC 7009). Revoking a *refresh* token
   * ends the grant, so the Supabase session the grant minted is signed out with
   * it; an access token on its own leaves the grant (and its session) alive.
   */
  revokeToken(input: {
    token: string;
    client: McpOAuthClientRecord;
    clientSecret?: string;
  }): Promise<void>;

  /**
   * Revoke every session a user has issued (sign out everywhere). Live
   * authorization codes go too, or a client mid-exchange would mint a fresh pair
   * from the one call the disconnect had already passed. The Supabase sessions
   * those grants minted are signed out as well, so a disconnect releases the
   * access rather than merely the MCP tokens.
   */
  revokeAllUserTokens(userId: string): Promise<void>;

  /**
   * The user's live grants — one row per connected MCP client. This is what the
   * account area lists; nothing here is derived from a bearer token, so the page
   * a user disconnects from is the same page they review.
   */
  listUserGrants(userId: string): Promise<McpUserGrantRecord[]>;

  /**
   * Disconnect one client: revoke every token it holds for this user, leaving
   * their other clients (and their browser session) alone. A live authorization
   * code is dropped in the same breath, so consent already granted cannot be
   * exchanged for a fresh grant after the disconnect. That client's minted
   * Supabase session is signed out too; no other client's is.
   */
  revokeUserClient(userId: string, clientId: string): Promise<void>;
}

export function createMcpOAuthProvider(deps: McpOAuthProviderDeps = {}): McpOAuthProvider {
  const repo = deps.repo ?? createMcpOAuthRepository();
  const bridgeSessions = deps.bridgeSessions ?? createMcpBridgeSessionRevoker();

  return {
    async getClient(clientId) {
      return repo.getClient(clientId);
    },

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

      const claimed = await repo.markAuthCodeUsed(codeRow.id);
      if (!claimed) {
        throw new McpOAuthError(
          400,
          'invalid_grant',
          'Authorization code is invalid or already used'
        );
      }

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

      // The refresh row carries everything needed to reissue (user, scope,
      // encrypted session), so a valid refresh token must never depend on the
      // paired access row still existing: the daily sweep deletes access rows
      // once they expire (1h TTL) while refresh tokens stay valid for 30 days.
      // Prefer the access row's `session_enc` when it is still present because
      // the data plane persists the rotated Supabase refresh token there.
      const accessRow = await repo.getAccessTokenByRefreshHash(refreshHash);

      // Single-use rotation: claim the refresh row before issuing anything, so
      // two overlapping refreshes cannot both rotate it. The claim also revokes
      // and shreds the row (see the repository), and the read above happened
      // first on purpose. The loser is answered `invalid_grant` — the same answer
      // a replayed, already-rotated token gets — and mints nothing.
      const claimed = await repo.claimRefreshToken(refreshRow.id);
      if (!claimed) {
        throw new McpOAuthError(400, 'invalid_grant', 'Refresh token has already been rotated');
      }

      // Rotation: revoke the superseded access row, then issue a brand-new pair.
      // Retiring the old bearer is the revoke's job — the data plane re-verifies
      // every cache hit against the row — and dropping the cache entry is a
      // local tidy-up on top of that. Both rows were read before anything was
      // revoked on purpose — the claim and the revoke shred `session_enc`, and
      // `issueTokenPair` below still needs the encrypted session to carry
      // forward.
      if (accessRow) {
        await repo.revokeToken(accessRow.id);
        invalidateTokenCache(accessRow.token_hash);
      }

      return issueTokenPair(repo, {
        client: input.client,
        userId: refreshRow.user_id,
        scopes: refreshRow.scope as McpScope[],
        sessionEnc: accessRow?.session_enc ?? refreshRow.session_enc,
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
      // The paired access row is read before anything is revoked: revoking shreds
      // `session_enc`, and the bridge session it names may still need signing out.
      const accessRow =
        row.kind === 'refresh' ? await repo.getAccessTokenByRefreshHash(row.token_hash) : null;
      await repo.revokeToken(row.id);
      // Local tidy-up only: the data plane re-checks the row on every cache hit,
      // so no instance is left authorizing this token by the write above.
      invalidateTokenCache(row.token_hash);
      if (accessRow) {
        await repo.revokeToken(accessRow.id);
        invalidateTokenCache(accessRow.token_hash);
      }
      // Only revoking the refresh token ends the grant — the access token alone
      // can be replaced from the refresh row, so its bridge session must stay
      // usable. Where the grant does end, the session goes with it.
      if (row.kind === 'refresh') {
        await revokeOwnedBridgeSessions(bridgeSessions, [row.session_enc, accessRow?.session_enc]);
      }
    },

    async revokeAllUserTokens(userId) {
      // Read before the shred below: the tokens are already revoked by the time
      // the sign-outs run, and their ciphertexts are gone.
      const sessionEncs = await repo.listUserSessionEncs(userId);
      await repo.revokeAllUserTokens(userId);
      await repo.deleteUserAuthCodes(userId);
      invalidateUserCache(userId);
      await revokeOwnedBridgeSessions(bridgeSessions, sessionEncs);
    },

    async listUserGrants(userId) {
      return repo.listUserGrants(userId, new Date());
    },

    async revokeUserClient(userId, clientId) {
      const sessionEncs = await repo.listUserSessionEncs(userId, clientId);
      await repo.revokeUserClientTokens(userId, clientId);
      await repo.deleteUserClientAuthCodes(userId, clientId);
      // Coarse on purpose. Dropping every cached context this user holds costs
      // their other clients one re-resolve, and it cannot leave this instance
      // holding a context for a token the write above just revoked — though the
      // per-request row check, not this call, is what makes that true for every
      // other instance.
      invalidateUserCache(userId);
      await revokeOwnedBridgeSessions(bridgeSessions, sessionEncs);
    },
  };
}

/**
 * Sign out the sessions a *live* revoke has just stranded.
 *
 * A retired grant needs none of this: every retirement path has GoTrue's own
 * refusal behind it (`refresh_token_not_found`, `session_expired`,
 * `user_banned`) or a ciphertext that will not decrypt, so there is nothing left
 * to revoke and no call is made (ADR 0023). This is the other case — RFC 7009
 * `/mcp/revoke`, or one of the account area's two disconnects — where the bridge
 * session is still perfectly usable and would otherwise outlive the grant that
 * owned it.
 *
 * Only a marked ciphertext is signed out. An unmarked one is a pre-amendment row
 * holding a copy of the user's *browser* session, and signing that out would sign
 * them out of the website; `readBridgeSession` is what tells the two apart.
 *
 * Best effort throughout, and deliberately *after* the caller's revoke: the
 * tokens are already revoked and the ciphertext already shredded, so a failure
 * here costs the user a still-live Supabase session, never a working grant.
 * `allSettled`, not `all`: one session that will not sign out must not withhold
 * the others, and a revoke that has already succeeded must never fail on this.
 */
async function revokeOwnedBridgeSessions(
  revoker: McpBridgeSessionRevoker,
  ciphertexts: Array<string | null | undefined>
): Promise<void> {
  const owned = new Set<string>();
  for (const payload of ciphertexts) {
    if (!payload) continue;
    try {
      const session = readBridgeSession(payload);
      if (session.owned) owned.add(session.refreshToken);
    } catch {
      // Undecryptable (the encryption key rotated): the session cannot even be
      // named, let alone revoked.
    }
  }
  await Promise.allSettled([...owned].map((refreshToken) => revoker.revoke(refreshToken)));
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
