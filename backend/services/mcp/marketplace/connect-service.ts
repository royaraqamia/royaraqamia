import type { McpMarketplaceRepository } from '@/backend/repositories/mcp/marketplace-repository';
import type { McpRemoteClient } from '@/backend/clients/mcp-remote';
import { McpRemoteError, type McpOAuthClient } from '@/backend/shared/domain/mcp-remote';
import {
  staticClientDiscovery,
  type McpStaticClientMap,
} from '@/backend/shared/domain/mcp-static-clients';
import { createPlanGate } from '@/backend/config/plans';
import { OWNED_ITEMS } from '@/shared/contracts/plans';
import {
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
  hashToken,
} from '@/backend/shared/mcp-token-crypto';
import { logger } from '@/backend/shared/logger';
import type { Json } from '@/backend/models/database.types';

/**
 * The outbound connect flow: one member, one catalogue row, one OAuth 2.1
 * authorization-code exchange with PKCE (ADR-0155).
 *
 * Two calls, because a browser leaves in between: `start` discovers, registers
 * us where the server offers dynamic registration, and returns the provider's
 * authorize URL; `complete` runs when the provider redirects back, claims the
 * attempt, exchanges the code, stores the tokens, and reads the tool list.
 *
 * Three things are deliberately strict:
 *
 * - **Nothing is guessed.** No publish metadata means no connection; no
 *   registration endpoint and no cached registration means no connection. Both
 *   are refusals with their own sentence, because a guessed endpoint is a member
 *   sent to a host nobody agreed to.
 * - **The attempt is single-use and short-lived.** The row is deleted by the
 *   claim that consumes it, so a replayed `state` finds nothing.
 * - **The tokens never leave this function in plaintext.** The repository stores
 *   ciphertext; decryption happens here, for the length of one call.
 */

export type McpConnectFailure =
  'unknown_app' | 'blocked' | 'expired_state' | 'plan_limit' | 'registration' | 'remote';

/** A refusal with a sentence the caller may show, and nothing else. */
export class McpConnectError extends Error {
  constructor(
    readonly failure: McpConnectFailure,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'McpConnectError';
  }
}

/** The attempt a consent may sit on: long enough to sign in, short enough to forget. */
const ATTEMPT_TTL_MS = 10 * 60 * 1000;

/** The refusal at the connected-app cap, one copy for both calls that ask. */
const PLAN_LIMIT_SENTENCE = 'وصلت إلى حدّ التطبيقات في خطتك. افصل تطبيقاً أو ارتقِ بالخطة.';

/**
 * The cap trigger's SQLSTATE (`private.assert_owned_item_cap`). The check here
 * settles a race most of the time; when two callbacks pass it together, Postgres
 * is the one that refuses, and the member should read the same sentence rather
 * than a generic failure.
 */
function isPlanCapRefusal(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'PL001'
  );
}

export interface McpConnectService {
  start(input: {
    userId: string;
    registryName: string;
    redirectUri: string;
  }): Promise<{ authorizeUrl: string }>;
  complete(input: {
    userId: string;
    state: string;
    code: string;
  }): Promise<{ connectionId: string }>;
}

interface ConnectServiceDependencies {
  repository: McpMarketplaceRepository;
  remote: McpRemoteClient;
  /**
   * The reviewed clients we registered by hand, keyed by catalogue row. Empty is
   * the DCR-only world this flow was built for; a row that has one skips
   * discovery and registration entirely (`backend/config/mcp-static-clients.ts`).
   */
  staticClients?: McpStaticClientMap;
  /** The name we register with a third party. */
  clientName?: string;
  now?: () => Date;
  /** The cap, replaced in tests. */
  assertConnectionSlot?: (userId: string) => Promise<void>;
}

const DEFAULT_CLIENT_NAME = 'royaraqamia';

export function createMcpConnectService({
  repository,
  remote,
  staticClients = new Map(),
  clientName = DEFAULT_CLIENT_NAME,
  now = () => new Date(),
  assertConnectionSlot,
}: ConnectServiceDependencies): McpConnectService {
  const checkSlot =
    assertConnectionSlot ??
    (async (userId: string) => {
      await createPlanGate().cap(userId, OWNED_ITEMS.mcpConnectedApps, 1);
    });

  /**
   * Ask the cap about a connection that would be new. Re-consenting for a
   * server the member already connected reuses its slot, so a live row for that
   * server is not counted twice.
   *
   * Both calls ask: `start` before the browser leaves, for the refusal the
   * member reads on the page, and `complete` when the consent comes back,
   * because the last free slot can be spent while two flows are open.
   */
  async function requireSlot(userId: string, registryName: string) {
    const existing = await repository.findLiveConnection(userId, registryName);
    if (existing) return;

    try {
      await checkSlot(userId);
    } catch (error) {
      throw new McpConnectError('plan_limit', PLAN_LIMIT_SENTENCE, error);
    }
  }

  /** The catalogue row, or the refusal that says why there is none. */
  async function catalogServer(registryName: string) {
    const server = await repository.getCatalogServer(registryName);
    if (!server || server.status === 'deleted') {
      throw new McpConnectError('unknown_app', 'هذا التطبيق غير موجود في المتجر');
    }
    if (server.blocked_at) {
      throw new McpConnectError('blocked', 'هذا التطبيق موقوف ولا يمكن ربطه');
    }
    // The store's admission rule, enforced where the socket opens: a row nobody
    // vouched for is not connectable by a hand-built request either.
    if (!server.verified_at) {
      throw new McpConnectError('unknown_app', 'هذا التطبيق غير معتمد في المتجر');
    }
    return server;
  }

  /**
   * Who we are at the provider, and the discovery that goes with it.
   *
   * Three answers, in this order: a client a person registered (the reviewed
   * table), one we registered earlier and cached, or — only during `start` — a
   * fresh dynamic registration. `complete` may not register: a callback is a
   * consent coming back, not a place to create a client.
   */
  async function resolveClient({
    registryName,
    serverUrl,
    redirectUri,
    mayRegister,
  }: {
    registryName: string;
    serverUrl: string;
    redirectUri: string;
    mayRegister: boolean;
  }) {
    const preRegistered = staticClients.get(registryName);
    if (preRegistered) {
      return {
        discovery: staticClientDiscovery(preRegistered, serverUrl),
        client: {
          clientId: preRegistered.clientId,
          clientSecret: preRegistered.clientSecret,
          tokenEndpointAuthMethod: preRegistered.tokenEndpointAuthMethod,
        } satisfies McpOAuthClient,
        // The secret is configured in the environment, so it is encrypted on the
        // way to the credential row exactly like a registered one.
        clientSecretEnc: preRegistered.clientSecret
          ? encryptSecret(preRegistered.clientSecret)
          : null,
        registrationKind: 'static' as const,
        scopes: preRegistered.scopes,
      };
    }

    const discovery = await remote.discover(serverUrl);
    let registration = await repository.getRegistration(discovery.authorizationServer, redirectUri);

    if (!registration) {
      if (!mayRegister) {
        throw new McpConnectError(
          'registration',
          'تغيّر تسجيل التطبيق أثناء الربط. ابدأ الربط من جديد.'
        );
      }
      if (!discovery.registrationEndpoint) {
        throw new McpConnectError(
          'registration',
          'التطبيق لا يسمح بتسجيل عملاء جدد، ولا يمكن ربطه',
          new McpRemoteError('registration', 'no registration_endpoint')
        );
      }

      try {
        const registered = await remote.register({
          discovery,
          redirectUri,
          clientName,
        });
        registration = {
          authorization_server: discovery.authorizationServer,
          redirect_uri: redirectUri,
          client_id: registered.clientId,
          client_secret_enc: registered.clientSecret
            ? encryptSecret(registered.clientSecret)
            : null,
          registration_kind: 'dcr',
        };
        await repository.saveRegistration(registration);
      } catch (error) {
        throw new McpConnectError(
          'registration',
          'تعذّر تسجيل التطبيق لدينا، ولا يمكن ربطه',
          error
        );
      }
    }

    return {
      discovery,
      client: {
        clientId: registration.client_id,
        clientSecret: registration.client_secret_enc
          ? decryptSecret(registration.client_secret_enc)
          : null,
      } satisfies McpOAuthClient,
      clientSecretEnc: registration.client_secret_enc,
      registrationKind: registration.registration_kind,
      scopes: [] as string[],
    };
  }

  return {
    async start({ userId, registryName, redirectUri }) {
      const server = await catalogServer(registryName);

      // Re-consenting for a server the member already connected reuses its slot,
      // so the cap is only asked about a connection that would be new.
      await requireSlot(userId, registryName);

      const serverUrl = server.remote_override ?? server.remote_url;
      const { discovery, client, scopes } = await resolveClient({
        registryName,
        serverUrl,
        redirectUri,
        mayRegister: true,
      });

      const state = generateOpaqueToken();

      const { url, codeVerifier } = await remote.authorizeUrl({
        discovery,
        client,
        redirectUri,
        state,
        scopes,
      });

      await repository.saveAttempt({
        stateHash: hashToken(state),
        userId,
        registryName,
        serverUrl: server.remote_override ?? server.remote_url,
        codeVerifierEnc: encryptSecret(codeVerifier),
        redirectUri,
        expiresAt: new Date(now().getTime() + ATTEMPT_TTL_MS).toISOString(),
      });

      return { authorizeUrl: url };
    },

    async complete({ userId, state, code }) {
      const attempt = await repository.claimAttempt(hashToken(state), now().toISOString());
      // One sentence covers "expired", "already used" and "someone else's": a
      // caller must not learn which, and there is nothing different to do.
      if (!attempt || attempt.user_id !== userId) {
        throw new McpConnectError('expired_state', 'انتهت صلاحية طلب الربط. ابدأ الربط من جديد.');
      }

      // The cap belongs to the write, not to the redirect that started it: two
      // flows can be opened under the same last free slot and both come back.
      // The attempt is already claimed, so this refuses before the code is
      // exchanged rather than after a consent nobody counted.
      await requireSlot(userId, attempt.registry_name);

      const { discovery, client, clientSecretEnc, registrationKind } = await resolveClient({
        registryName: attempt.registry_name,
        serverUrl: attempt.server_url,
        redirectUri: attempt.redirect_uri,
        mayRegister: false,
      });

      const tokens = await remote.exchange({
        discovery,
        client,
        code,
        codeVerifier: decryptSecret(attempt.code_verifier_enc),
        redirectUri: attempt.redirect_uri,
      });

      const server = await catalogServer(attempt.registry_name);
      let connection = await repository.findLiveConnection(userId, attempt.registry_name);
      if (!connection) {
        try {
          connection = await repository.createConnection({
            userId,
            registryName: attempt.registry_name,
            serverUrl: attempt.server_url,
            displayName: server.name_ar ?? server.title ?? attempt.registry_name,
          });
        } catch (error) {
          // The trigger's refusal is this same cap, reached between the check
          // above and this insert: a race is the one thing left that can spend
          // the last slot after `requireSlot` said there was one.
          if (!isPlanCapRefusal(error)) throw error;
          throw new McpConnectError('plan_limit', PLAN_LIMIT_SENTENCE, error);
        }
      }

      await repository.saveCredentials({
        connectionId: connection.id,
        authorizationServer: discovery.authorizationServer,
        tokenEndpoint: discovery.tokenEndpoint,
        registrationKind,
        clientId: client.clientId,
        clientSecretEnc,
        accessTokenEnc: encryptSecret(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
        scope: tokens.scope ?? null,
        expiresAt: tokens.expires_in
          ? new Date(now().getTime() + tokens.expires_in * 1000).toISOString()
          : null,
        metadata: discovery.metadata as unknown as Json,
      });

      // The grant is real from here even if the tool list is not: the member's
      // consent succeeded, so a failed read is a state on the row, not a lost
      // connection they would have to authorise again.
      try {
        const tools = await remote.listTools({
          serverUrl: connection.server_url,
          accessToken: tokens.access_token,
        });
        await repository.saveTools(connection.id, tools);
        await repository.updateConnection(connection.id, {
          status: 'active',
          tool_count: tools.length,
          last_synced_at: now().toISOString(),
          last_error: null,
        });
      } catch (error) {
        logger.warn('MCP marketplace: tool list failed after consent', {
          connectionId: connection.id,
          error: String(error),
        });
        await repository.updateConnection(connection.id, {
          status: 'error',
          last_error: 'تعذّر قراءة أدوات التطبيق',
        });
      }

      return { connectionId: connection.id };
    },
  };
}
