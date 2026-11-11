import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

import { MCP_SERVER_VERSION } from '@/backend/services/mcp/constants';
import { EgressBlockedError, createGuardedFetch, readCappedText } from '@/backend/shared/egress';
import {
  McpRemoteError,
  type McpConnectProbe,
  type McpRemoteFailure,
} from '@/backend/shared/domain/mcp-remote';
import { logger } from '@/backend/shared/logger';

/**
 * The only module that speaks to a third-party MCP server (ADR-0155).
 *
 * It exists so the egress policy has one owner: every socket opened while نور
 * reaches a stranger's app is opened from this file, through the `fetch` that
 * `backend/shared/egress` hands out. Nothing here reads or writes our database,
 * and nothing here knows about a member — a caller passes a URL and a token.
 *
 * The OAuth half is the MCP SDK's own, deliberately: RFC 9728 discovery, RFC
 * 8414 metadata, RFC 7591 dynamic registration, PKCE, and the token exchange are
 * a specification with sharp corners, and our hand-written version would be an
 * untested reimplementation of code that already ships to every MCP client. The
 * SDK functions all take `fetchFn`, which is how the egress policy stays
 * enforced over them.
 *
 * A server that publishes no authorization-server metadata, or that refuses
 * dynamic registration, is **not connectable**: both are recorded as a refusal
 * with its own message rather than guessed at with default endpoints. Guessing
 * an endpoint is how a consent screen ends up sending a member to a host nobody
 * agreed to.
 */

/** A discovery document reduced to what this client needs to keep. */
export interface McpDiscovery {
  /** The resource server we asked about, canonicalised. */
  resource: string;
  authorizationServer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string | null;
  scopes: string[];
  /** The brand mark the resource metadata publishes, when it is an https URL. */
  logoUrl: string | null;
  /** Kept verbatim so the connection row can record what it agreed to. */
  metadata: AuthorizationServerMetadata;
}

export interface McpRegistration {
  clientId: string;
  clientSecret: string | null;
  kind: 'dcr';
}

export interface McpRemoteTool {
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
  /** `annotations.readOnlyHint`, and false when the server says nothing. */
  readOnly: boolean;
}

// Re-exported for the callers that already speak to this client; the class
// itself lives in the domain so a service may match on it.
export { McpRemoteError, type McpRemoteFailure };

/** The ceiling a catalogue probe gets, against the 20s a real call may take. */
const PROBE_TIMEOUT_MS = 4_000;

/**
 * The brand mark an RFC 9728 document advertises, as an https URL or nothing.
 *
 * The SDK's resource metadata is loose, so the field is `unknown` here: an
 * `http:` logo is dropped rather than mixed into an https page, and a value that
 * is not a URL is not a reason to fail the probe.
 */
function resourceLogoUrl(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as { logo_uri?: unknown }).logo_uri;
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The mime an icon URL names, for the proxy's allowlist; `null` when it does not. */
function iconMimeFromUrl(value: string | null): string | null {
  if (!value) return null;
  let pathname: string;
  try {
    pathname = new URL(value).pathname.toLowerCase();
  } catch {
    return null;
  }
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.ico')) return 'image/x-icon';
  return null;
}

export interface McpRemoteClient {
  discover(serverUrl: string | URL): Promise<McpDiscovery>;
  /**
   * Whether this server can be connected at all — the catalogue's verdict
   * (phase 2, #1223). A measurement, not a call: it answers `false` with a
   * reason instead of throwing, because the caller is filling a column, not
   * serving a member's tap.
   */
  probeConnectable(serverUrl: string | URL): Promise<McpConnectProbe>;
  register(input: {
    discovery: McpDiscovery;
    redirectUri: string;
    clientName: string;
  }): Promise<McpRegistration>;
  /**
   * The URL the member is sent to, and the PKCE verifier that must survive until
   * the callback. The SDK builds it; the caller stores the verifier encrypted.
   */
  authorizeUrl(input: {
    discovery: McpDiscovery;
    client: { clientId: string; clientSecret: string | null };
    redirectUri: string;
    state: string;
  }): Promise<{ url: string; codeVerifier: string }>;
  exchange(input: {
    discovery: McpDiscovery;
    client: { clientId: string; clientSecret: string | null };
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<OAuthTokens>;
  refresh(input: {
    discovery: McpDiscovery;
    client: { clientId: string; clientSecret: string | null };
    refreshToken: string;
  }): Promise<OAuthTokens>;
  /**
   * RFC 7009 revocation at the provider, when its metadata publishes an
   * endpoint. Answers `false` when it does not support it — the caller still
   * forgets the connection locally, because a member's disconnect must not be
   * held hostage by a server that never implemented revocation.
   */
  revoke(input: {
    metadata: AuthorizationServerMetadata;
    client: { clientId: string; clientSecret: string | null };
    token: string;
    tokenTypeHint: 'access_token' | 'refresh_token';
  }): Promise<boolean>;
  /** `initialize` + `tools/list`, in one connection that is closed again. */
  listTools(input: { serverUrl: string | URL; accessToken: string }): Promise<McpRemoteTool[]>;
}

interface ClientDependencies {
  /** Defaults to the guarded fetch; a test passes its own. */
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<Array<{ address: string }>>;
}

/** What the SDK holds for a registered client, in the shape its helpers want. */
function clientInformation(client: {
  clientId: string;
  clientSecret: string | null;
}): OAuthClientInformationFull {
  return {
    client_id: client.clientId,
    ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
    // The SDK reads these when the server's metadata is silent about methods.
    redirect_uris: [],
    grant_types: ['authorization_code', 'refresh_token'],
  } as OAuthClientInformationFull;
}

export function createMcpRemoteClient(dependencies: ClientDependencies = {}): McpRemoteClient {
  const guardedFetch = createGuardedFetch({
    ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    ...(dependencies.resolveHost ? { resolveHost: dependencies.resolveHost } : {}),
  });

  /**
   * The probe's own ceiling. A member is looking at a list of twenty rows, so a
   * stranger's slow server must not hold the page: four seconds is enough to
   * read two well-known documents and short enough to fail into «لم نتحقق بعد».
   */
  const probeFetch = createGuardedFetch({
    timeoutMs: PROBE_TIMEOUT_MS,
    ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    ...(dependencies.resolveHost ? { resolveHost: dependencies.resolveHost } : {}),
  });

  function mapFailure(error: unknown, failure: McpRemoteFailure, message: string): never {
    if (error instanceof McpRemoteError) throw error;
    if (error instanceof EgressBlockedError) {
      throw new McpRemoteError('blocked', error.message, error);
    }
    logger.warn('MCP marketplace: third-party call failed', {
      failure,
      error: String(error),
    });
    throw new McpRemoteError(failure, message, error);
  }

  async function discover(serverUrl: string | URL): Promise<McpDiscovery> {
    let info;
    try {
      info = await discoverOAuthServerInfo(serverUrl, { fetchFn: guardedFetch });
    } catch (error) {
      mapFailure(error, 'discovery', 'تعذّر قراءة إعدادات المصادقة لدى التطبيق');
    }

    const metadata = info.authorizationServerMetadata;
    if (!metadata?.authorization_endpoint || !metadata.token_endpoint) {
      throw new McpRemoteError('discovery', 'التطبيق لا ينشر إعدادات مصادقة صالحة، ولا يمكن ربطه');
    }

    return {
      resource: String(serverUrl),
      authorizationServer: info.authorizationServerUrl,
      authorizationEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      registrationEndpoint: metadata.registration_endpoint ?? null,
      scopes: metadata.scopes_supported ?? [],
      logoUrl: resourceLogoUrl(info.resourceMetadata),
      metadata,
    };
  }

  return {
    discover,

    async probeConnectable(serverUrl) {
      /*
        A pre-flight, because the difference matters to the admin reading the
        verdict: the SDK's discovery throws for both "the server answered 404 on
        the well-known document" and "the server never answered", and calling a
        timeout "no metadata" is a diagnosis nobody measured. Any HTTP answer —
        200, 404, even 500 — means the host is up; only a failed request means we
        could not measure it.
      */
      const wellKnown = new URL('/.well-known/oauth-protected-resource', serverUrl);
      try {
        await probeFetch(wellKnown, { headers: { accept: 'application/json' } });
      } catch (error) {
        if (error instanceof EgressBlockedError) {
          return { connectable: false, reason: 'blocked', logoUrl: null, logoMime: null };
        }
        logger.warn('MCP marketplace: connectability probe got no answer', {
          url: String(serverUrl),
          error: String(error),
        });
        return { connectable: false, reason: 'unreachable', logoUrl: null, logoMime: null };
      }

      try {
        const info = await discoverOAuthServerInfo(serverUrl, { fetchFn: probeFetch });
        const metadata = info.authorizationServerMetadata;
        const logoUrl = resourceLogoUrl(info.resourceMetadata);
        const logoMime = iconMimeFromUrl(logoUrl);
        if (!metadata?.authorization_endpoint || !metadata.token_endpoint) {
          return { connectable: false, reason: 'no_metadata', logoUrl, logoMime };
        }
        // The connect flow needs dynamic registration: a server that publishes
        // metadata and expects a pre-registered client is one we cannot reach in
        // v1 (measured: GitHub, in the spec's table).
        if (!metadata.registration_endpoint) {
          return { connectable: false, reason: 'no_registration', logoUrl, logoMime };
        }
        return { connectable: true, reason: null, logoUrl, logoMime };
      } catch (error) {
        if (error instanceof EgressBlockedError) {
          return { connectable: false, reason: 'blocked', logoUrl: null, logoMime: null };
        }
        // The document exists but cannot be read: that is what "publishes no
        // usable metadata" means, as opposed to the unreachable case above.
        logger.warn('MCP marketplace: connectability probe failed', {
          url: String(serverUrl),
          error: String(error),
        });
        return { connectable: false, reason: 'no_metadata', logoUrl: null, logoMime: null };
      }
    },

    /**
     * Dynamic registration. The first argument is the **authorization server**,
     * not the registration URL: the SDK reads `metadata.registration_endpoint`
     * from the document, and handing it an endpoint with no metadata makes it
     * fall back to the specification's default path (`/register`), which a
     * provider that hosts registration elsewhere answers with a 404 (#1215).
     *
     * No `scope` is declared. A registration that names every scope the server
     * publishes asks the member to grant the widest possible consent, and we
     * have no evidence yet about which of them the tools need: the provider's
     * own default is the starting grant, and widening it is a choice someone
     * makes on purpose.
     */
    async register({ discovery, redirectUri, clientName }) {
      try {
        const registered = await registerClient(discovery.authorizationServer, {
          metadata: discovery.metadata,
          fetchFn: guardedFetch,
          clientMetadata: {
            client_name: clientName,
            redirect_uris: [redirectUri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
          },
        });
        return {
          clientId: registered.client_id,
          clientSecret: registered.client_secret ?? null,
          kind: 'dcr' as const,
        };
      } catch (error) {
        mapFailure(error, 'registration', 'التطبيق رفض تسجيلنا كعميل، ولا يمكن ربطه');
      }
    },

    async authorizeUrl({ discovery, client, redirectUri, state }) {
      try {
        const { authorizationUrl, codeVerifier } = await startAuthorization(
          discovery.authorizationServer,
          {
            metadata: discovery.metadata,
            clientInformation: clientInformation(client),
            redirectUrl: redirectUri,
            state,
            resource: discovery.resource,
          }
        );
        return { url: authorizationUrl.toString(), codeVerifier };
      } catch (error) {
        mapFailure(error, 'authorization', 'تعذّر بدء المصادقة مع التطبيق');
      }
    },

    async exchange({ discovery, client, code, codeVerifier, redirectUri }) {
      try {
        return await exchangeAuthorization(discovery.authorizationServer, {
          metadata: discovery.metadata,
          clientInformation: clientInformation(client),
          authorizationCode: code,
          codeVerifier,
          redirectUri,
          resource: discovery.resource,
          fetchFn: guardedFetch,
        });
      } catch (error) {
        mapFailure(error, 'authorization', 'رفض التطبيق إتمام المصادقة');
      }
    },

    async refresh({ discovery, client, refreshToken }) {
      try {
        const tokens = await refreshAuthorization(discovery.authorizationServer, {
          metadata: discovery.metadata,
          clientInformation: clientInformation(client),
          refreshToken,
          resource: discovery.resource,
          fetchFn: guardedFetch,
        });
        // The SDK keeps the old refresh token when the server does not rotate.
        return { ...tokens, refresh_token: tokens.refresh_token ?? refreshToken };
      } catch (error) {
        mapFailure(error, 'authorization', 'انتهت صلاحية الوصول إلى التطبيق، ويلزم إعادة الربط');
      }
    },

    /**
     * RFC 7009. The endpoint comes from the authorization server's metadata,
     * which is why it can be missing: a provider that publishes none keeps its
     * token live until it expires, and the caller's local delete is still the
     * member's decision that this app forgets them.
     */
    async revoke({ metadata, client, token, tokenTypeHint }) {
      // The SDK's type is a union whose OpenID member has no revocation
      // endpoint; the key's presence is what the specification says to check.
      const endpoint = 'revocation_endpoint' in metadata ? metadata.revocation_endpoint : undefined;
      if (!endpoint) return false;

      const body = new URLSearchParams({
        token,
        token_type_hint: tokenTypeHint,
        client_id: client.clientId,
      });
      if (client.clientSecret) body.set('client_secret', client.clientSecret);

      try {
        const response = await guardedFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        // RFC 7009 answers 200 for "revoked" and for "this token was already
        // gone", which are the same outcome here. Anything else is a failure
        // the caller logs; it still deletes.
        if (!response.ok) {
          throw new Error(`revocation answered ${response.status}`);
        }
        return true;
      } catch (error) {
        mapFailure(error, 'authorization', 'تعذّر إلغاء صلاحية التطبيق لدى مزوّده');
      }
    },

    async listTools({ serverUrl, accessToken }) {
      const client = new Client(
        { name: 'royaraqamia', version: MCP_SERVER_VERSION },
        { capabilities: {} }
      );
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
        fetch: guardedFetch,
        requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
      });

      try {
        await client.connect(transport);
        const { tools } = await client.listTools();
        return tools.map((tool) => ({
          name: tool.name,
          description: tool.description ?? null,
          inputSchema: (tool.inputSchema ?? { type: 'object' }) as Record<string, unknown>,
          // A server that says nothing about a tool gets the safe answer.
          readOnly: tool.annotations?.readOnlyHint === true,
        }));
      } catch (error) {
        mapFailure(error, 'protocol', 'تعذّر قراءة أدوات التطبيق');
      } finally {
        await client.close().catch(() => undefined);
      }
    },
  };
}

/** Exported for the flow's own JSON reads, so the size ceiling is never skipped. */
export { readCappedText };
