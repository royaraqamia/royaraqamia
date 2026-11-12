import type { AuthorizationServerMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

import type { McpDiscovery, McpRemoteClient } from '@/backend/clients/mcp-remote';
import type {
  McpConnectionCredentialsRecord,
  McpConnectionRecord,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import { decryptSecret, encryptSecret } from '@/backend/shared/mcp-token-crypto';
import { McpRemoteError } from '@/backend/shared/domain/mcp-remote';
import { logger } from '@/backend/shared/logger';

/**
 * The access token a remote call needs, refreshed before it expires (#1227).
 *
 * The connect flow stores an access token with an hour of life and an encrypted
 * refresh token beside it, and nothing spent the refresh token: a connection
 * died an hour after consent, silently, and the failure surfaced as a provider
 * error in the middle of a turn. This is the caller that was missing.
 *
 * Three rules:
 *
 * - **Refresh on use, never on a timer.** A token that still has more than a
 *   minute is used as it is; only a call about to fail spends a refresh.
 * - **One caller spends one token.** A provider that rotates refresh tokens
 *   answers a second exchange of the same one with `invalid_grant`, which reads
 *   to the member as a revocation they never made, so the exchange is claimed in
 *   the database first and the loser waits for the winner's write.
 * - **A refused grant is a state, not an error.** `invalid_grant` moves the
 *   connection to `needs_reauth`, which the apps screen already draws as
 *   «أعد الربط» — the one repair is the member's, and a turn that says "try
 *   again" is advice that can never work.
 */

/** How close to expiry a token is refreshed rather than used. */
const REFRESH_WINDOW_MS = 60_000;

/**
 * How long a claim may stand before another caller takes it over. A refresh is
 * one round trip; a claim older than this belongs to a process that died.
 */
const CLAIM_STALE_MS = 30_000;

/** How long a caller waits for the winner's write, and how often it looks. */
const WAIT_ATTEMPTS = 5;
const WAIT_MS = 200;

export interface McpAccessTokenService {
  /**
   * A usable access token for one connection.
   *
   * Throws `McpRemoteError('reauth')` when the grant itself is gone, and a
   * `protocol` failure when the provider could not be reached — a caller shows
   * both as a sentence, and only the first changes the connection's state.
   *
   * `force` spends a refresh even when the stored token looks valid: a server
   * that refused it knows better than the expiry we recorded.
   */
  accessToken(
    connection: Pick<McpConnectionRecord, 'id' | 'server_url'>,
    options?: { force?: boolean }
  ): Promise<string>;
}

interface AccessTokenDependencies {
  repository: McpMarketplaceRepository;
  remote: McpRemoteClient;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

/** Whether the stored token is close enough to its end to be replaced. */
function isExpiring(credentials: McpConnectionCredentialsRecord, now: Date): boolean {
  if (!credentials.expires_at) return false;
  const expiresAt = Date.parse(credentials.expires_at);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt - now.getTime() <= REFRESH_WINDOW_MS;
}

/** The discovery a refresh needs, rebuilt from what the connection stored. */
function discoveryOf(
  credentials: McpConnectionCredentialsRecord,
  serverUrl: string
): McpDiscovery | null {
  const metadata = credentials.metadata;
  if (metadata === null || typeof metadata !== 'object') return null;
  if (!credentials.authorization_server || !credentials.token_endpoint) return null;
  return {
    // The resource the grant was scoped to, which a provider may require the
    // refresh to name (RFC 8707). The connection's own URL is that value.
    resource: serverUrl,
    authorizationServer: credentials.authorization_server,
    authorizationEndpoint: (metadata as AuthorizationServerMetadata).authorization_endpoint ?? '',
    tokenEndpoint: credentials.token_endpoint,
    registrationEndpoint: null,
    scopes: (metadata as AuthorizationServerMetadata).scopes_supported ?? [],
    logoUrl: null,
    metadata: metadata as AuthorizationServerMetadata,
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMcpAccessTokenService({
  repository,
  remote,
  now = () => new Date(),
  sleep = defaultSleep,
}: AccessTokenDependencies): McpAccessTokenService {
  /** The connection needs the member's consent again, and says so where the screen reads it. */
  async function markNeedsReauth(connectionId: string, message: string): Promise<void> {
    await repository.updateConnection(connectionId, {
      status: 'needs_reauth',
      last_error: message,
    });
  }

  return {
    async accessToken(connection, options = {}) {
      const stored = await repository.getCredentials(connection.id);
      if (!stored || !stored.access_token_enc) {
        throw new McpRemoteError(
          'reauth',
          'لم يعد لهذا التطبيق وصول محفوظ. أعد ربطه من «تطبيقاتنا».'
        );
      }

      if (!options.force && !isExpiring(stored, now())) {
        return decryptSecret(stored.access_token_enc);
      }

      // The claim is the lock: the row is updated only if nobody holds it, so a
      // concurrent turn loses the race instead of spending the same token.
      const claimedAt = now();
      const claim = await repository.claimRefresh(
        connection.id,
        claimedAt.toISOString(),
        new Date(claimedAt.getTime() - CLAIM_STALE_MS).toISOString()
      );

      if (!claim) {
        // Someone else is refreshing right now. Their write is what this caller
        // needs, so it looks for it rather than starting a second exchange.
        for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
          await sleep(WAIT_MS);
          const current = await repository.getCredentials(connection.id);
          if (current?.access_token_enc && !isExpiring(current, now())) {
            return decryptSecret(current.access_token_enc);
          }
        }
        throw new McpRemoteError(
          'protocol',
          'تعذّر تجديد الوصول إلى التطبيق الآن. حاول مرة أخرى بعد قليل.'
        );
      }

      if (!claim.refresh_token_enc) {
        await repository.releaseRefresh(connection.id);
        await markNeedsReauth(connection.id, 'انتهت صلاحية الوصول إلى التطبيق.');
        throw new McpRemoteError(
          'reauth',
          'انتهت صلاحية الوصول إلى التطبيق. أعد ربطه من «تطبيقاتنا».'
        );
      }

      // A key connection never reaches this service; a row with no OAuth half is a
      // credential that was replaced under a live connection (#1269).
      if (
        !claim.authorization_server ||
        !claim.token_endpoint ||
        !claim.registration_kind ||
        !claim.client_id
      ) {
        await repository.releaseRefresh(connection.id);
        await markNeedsReauth(connection.id, 'لم نعد نعرف مزوّد المصادقة لهذا التطبيق.');
        throw new McpRemoteError(
          'reauth',
          'لم نعد نعرف مزوّد المصادقة لهذا التطبيق. أعد ربطه من «تطبيقاتنا».'
        );
      }

      const discovery = discoveryOf(claim, connection.server_url);
      if (!discovery) {
        await repository.releaseRefresh(connection.id);
        await markNeedsReauth(connection.id, 'لم نعد نعرف مزوّد المصادقة لهذا التطبيق.');
        throw new McpRemoteError(
          'reauth',
          'لم نعد نعرف مزوّد المصادقة لهذا التطبيق. أعد ربطه من «تطبيقاتنا».'
        );
      }

      const refreshToken = decryptSecret(claim.refresh_token_enc);

      try {
        const tokens = await remote.refresh({
          discovery,
          client: {
            clientId: claim.client_id,
            clientSecret: claim.client_secret_enc ? decryptSecret(claim.client_secret_enc) : null,
          },
          refreshToken,
        });

        // The write releases the claim as it replaces the tokens: a caller that
        // crashed between the two would otherwise hold the row for the stale
        // window, and the next one would wait for nothing.
        await repository.saveCredentials({
          connectionId: connection.id,
          authorizationServer: claim.authorization_server,
          tokenEndpoint: claim.token_endpoint,
          registrationKind: claim.registration_kind,
          clientId: claim.client_id,
          clientSecretEnc: claim.client_secret_enc,
          accessTokenEnc: encryptSecret(tokens.access_token),
          // A provider that does not rotate keeps the token we spent, so this
          // is the one to spend next time either way.
          refreshTokenEnc: encryptSecret(tokens.refresh_token ?? refreshToken),
          scope: tokens.scope ?? claim.scope,
          expiresAt: tokens.expires_in
            ? new Date(now().getTime() + tokens.expires_in * 1000).toISOString()
            : null,
          metadata: claim.metadata,
        });

        return tokens.access_token;
      } catch (error) {
        await repository.releaseRefresh(connection.id);

        if (error instanceof McpRemoteError && error.failure === 'reauth') {
          await markNeedsReauth(connection.id, error.message);
          throw error;
        }

        logger.warn('MCP marketplace: token refresh failed', {
          connectionId: connection.id,
          error: String(error),
        });
        throw error;
      }
    },
  };
}
