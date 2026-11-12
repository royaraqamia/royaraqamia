import type {
  McpCatalogServerRecord,
  McpConnectionRecord,
  McpMarketplaceRepository,
} from '@/backend/repositories/mcp/marketplace-repository';
import type { McpRemoteClient } from '@/backend/clients/mcp-remote';
import {
  McpRemoteError,
  type McpAuthMode,
  type McpDiscovery,
  type McpOAuthClient,
  type McpRequestAuth,
} from '@/backend/shared/domain/mcp-remote';
import {
  staticClientDiscovery,
  type McpStaticClientMap,
} from '@/backend/shared/domain/mcp-static-clients';
import { createPlanGate } from '@/backend/config/plans';
import { requestedScopesFor } from '@/backend/config/mcp-scopes';
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
  | 'unknown_app'
  | 'blocked'
  | 'expired_state'
  | 'plan_limit'
  | 'registration'
  | 'remote'
  /** An `api_key` row was asked to connect without the key (#1269). */
  | 'missing_key'
  /** A key was offered to a connection that does not hold one (#1269). */
  | 'wrong_mode';

/**
 * What `start` answers: either the provider's consent URL the browser visits, or
 * a connection that was made without leaving the site (#1269).
 */
export type McpConnectStart =
  { kind: 'authorize'; authorizeUrl: string } | { kind: 'connected'; connectionId: string };

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
  /**
   * Starts a link. An OAuth row answers the consent URL the browser visits
   * (ADR-0155); a row that needs no credential, or a key the member just typed,
   * is connected here and answers the connection (#1269).
   */
  start(input: {
    userId: string;
    registryName: string;
    redirectUri: string;
    /** Required for an `api_key` row, ignored otherwise. Never logged. */
    apiKey?: string;
  }): Promise<McpConnectStart>;
  complete(input: {
    userId: string;
    state: string;
    code: string;
  }): Promise<{ connectionId: string }>;
  /**
   * Replaces the key a live `api_key` connection holds (#1269). It is the
   * rotation path the security review asks for: a key is a credential with a
   * life, and re-entering one must not require disconnecting the app.
   */
  replaceApiKey(input: { userId: string; connectionId: string; apiKey: string }): Promise<void>;
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
   * How the row authenticates (#1269). A row whose stored value a later version
   * stops naming is OAuth, which is what every row was before the column.
   */
  function authModeOf(server: McpCatalogServerRecord): McpAuthMode {
    const value: string = server.auth_mode;
    return value === 'none' || value === 'api_key' ? value : 'oauth';
  }

  /**
   * The header a key goes in, and the scheme in front of it.
   *
   * Both are the catalogue row's, read from the server's own documentation by an
   * admin. `null` means the key is the whole header value: we never invent a
   * `Bearer` prefix, because a server that wants the key bare would refuse it.
   */
  function keyHeader(server: McpCatalogServerRecord | null): string {
    return server?.api_key_header?.trim() || 'Authorization';
  }

  function keyPrefix(server: McpCatalogServerRecord | null): string | null {
    return server?.api_key_prefix?.trim() || null;
  }

  function keyValue(server: McpCatalogServerRecord | null, apiKey: string): string {
    const prefix = keyPrefix(server);
    return prefix ? `${prefix} ${apiKey}` : apiKey;
  }

  /**
   * Reads the tool list after a credential was stored, and records the outcome on
   * the row. A failure is a state, not a lost connection: the member lands on the
   * screen that explains it and, for a key, can paste another one.
   */
  async function readTools(connection: McpConnectionRecord, auth: McpRequestAuth): Promise<void> {
    try {
      const tools = await remote.listTools({ serverUrl: connection.server_url, auth });
      await repository.saveTools(connection.id, tools);
      await repository.updateConnection(connection.id, {
        status: 'active',
        tool_count: tools.length,
        last_synced_at: now().toISOString(),
        last_error: null,
      });
    } catch (error) {
      logger.warn('MCP marketplace: tool list failed after connecting', {
        connectionId: connection.id,
        error: String(error),
      });
      await repository.updateConnection(connection.id, {
        status: 'error',
        last_error: 'تعذّر قراءة أدوات التطبيق',
      });
    }
  }

  /**
   * The two modes that never leave the site (#1269): no credential at all, or a
   * key the member pasted. Neither has a consent screen, so the call that proves
   * the link is the tool read — and it is the only place the key is used in
   * plaintext, for the length of one request.
   */
  async function connectDirect({
    userId,
    registryName,
    server,
    apiKey,
  }: {
    userId: string;
    registryName: string;
    server: McpCatalogServerRecord;
    apiKey?: string;
  }): Promise<{ connectionId: string }> {
    const mode = authModeOf(server);
    if (mode === 'api_key' && !apiKey) {
      throw new McpConnectError(
        'missing_key',
        'هذا التطبيق يحتاج مفتاحاً من عندك. الصقه ثم أعد المحاولة.'
      );
    }
    const key = apiKey ?? '';

    await requireSlot(userId, registryName);

    const serverUrl = server.remote_override ?? server.remote_url;
    let connection = await repository.findLiveConnection(userId, registryName);
    if (!connection) {
      try {
        connection = await repository.createConnection({
          userId,
          registryName,
          serverUrl,
          displayName: server.name_ar ?? server.title ?? registryName,
          authMode: mode,
        });
      } catch (error) {
        if (!isPlanCapRefusal(error)) throw error;
        throw new McpConnectError('plan_limit', PLAN_LIMIT_SENTENCE, error);
      }
    } else if (connection.auth_mode !== mode) {
      // The row moved mode since this connection was made; re-linking follows it
      // and replaces whatever credential the old mode stored.
      await repository.updateConnection(connection.id, { auth_mode: mode });
      connection = { ...connection, auth_mode: mode };
    }

    if (mode === 'api_key') {
      await repository.saveApiKey({
        connectionId: connection.id,
        apiKeyEnc: encryptSecret(key),
        header: keyHeader(server),
        prefix: keyPrefix(server),
      });
      await readTools(connection, {
        kind: 'api_key',
        header: keyHeader(server),
        value: keyValue(server, key),
      });
    } else {
      // A `none` connection holds no secret; a credential row left from an
      // earlier mode would be a secret nobody uses.
      await repository.deleteCredentials(connection.id);
      await readTools(connection, { kind: 'none' });
    }

    return { connectionId: connection.id };
  }

  /**
   * The permissions to ask for: the row's measured set, kept to what the provider
   * says it supports (#1230).
   *
   * A provider that publishes no `scopes_supported` is not filtered against an
   * empty list — we have nothing to check it with, and the row's set is still the
   * measured one. A provider that publishes them gets only the overlap, so a
   * scope it retired is dropped here rather than sent and refused at consent.
   */
  function scopesToRequest(registryName: string, discovery: McpDiscovery): string[] {
    const requested = requestedScopesFor(registryName);
    if (!requested) return [];
    if (discovery.scopes.length === 0) return [...requested];
    const advertised = new Set(discovery.scopes);
    return requested.filter((scope) => advertised.has(scope));
  }

  /**
   * Who we are at the provider, and the discovery that goes with it.
   *
   * Three answers, in this order: a client a person registered (the reviewed
   * table), one we registered earlier and cached, or — only during `start` — a
   * fresh dynamic registration. `complete` may not register: a callback is a
   * consent coming back, not a place to create a client.
   *
   * The cached registration is reused only when the scope set it was created for
   * is the set the row asks for now. A provider can bind the grant to the client
   * (measured: Supabase, 2026-11-11), so a narrower cached client would keep
   * refusing the tools the set was widened for — the member would approve a
   * wider consent and get the old grant back.
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
    const scopes = scopesToRequest(registryName, discovery);
    const scopeKey = scopes.join(' ');

    let registration = await repository.getRegistration(discovery.authorizationServer, redirectUri);

    if (!registration || registration.scope !== scopeKey) {
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
          scopes,
        });
        registration = {
          authorization_server: discovery.authorizationServer,
          redirect_uri: redirectUri,
          client_id: registered.clientId,
          client_secret_enc: registered.clientSecret
            ? encryptSecret(registered.clientSecret)
            : null,
          registration_kind: 'dcr',
          scope: scopeKey,
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
      scopes,
    };
  }

  return {
    async start({ userId, registryName, redirectUri, apiKey }) {
      const server = await catalogServer(registryName);

      /*
        The two modes without a consent screen connect here (#1269). They are not
        a shortcut around OAuth: there is nothing to consent to, and the key — the
        only secret involved — is stored encrypted and used once to prove it.
      */
      if (authModeOf(server) !== 'oauth') {
        const { connectionId } = await connectDirect({
          userId,
          registryName,
          server,
          ...(apiKey ? { apiKey } : {}),
        });
        return { kind: 'connected', connectionId };
      }

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

      return { kind: 'authorize', authorizeUrl: url };
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
            authMode: 'oauth',
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
      await readTools(connection, { kind: 'bearer', token: tokens.access_token });

      return { connectionId: connection.id };
    },

    async replaceApiKey({ userId, connectionId, apiKey }) {
      const connection = await repository.getConnection(userId, connectionId);
      if (!connection || connection.status === 'revoked') {
        throw new McpConnectError('unknown_app', 'هذا التطبيق غير مرتبط بحسابك.');
      }
      if (connection.auth_mode !== 'api_key') {
        throw new McpConnectError(
          'wrong_mode',
          'هذا التطبيق لا يستخدم مفتاحاً، ولا يمكن استبداله به.'
        );
      }

      /*
        The row's header is read fresh but the row itself is not required to be
        verified: a takedown stops new links, and taking away the member's ability
        to rotate a key they already hold would break a live connection for a
        reason that has nothing to do with it.
      */
      const server = await repository.getCatalogServer(connection.registry_name);

      await repository.saveApiKey({
        connectionId: connection.id,
        apiKeyEnc: encryptSecret(apiKey),
        header: keyHeader(server),
        prefix: keyPrefix(server),
      });
      await readTools(connection, {
        kind: 'api_key',
        header: keyHeader(server),
        value: keyValue(server, apiKey),
      });
    },
  };
}
