import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  extractWWWAuthenticateParams,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js';
import {
  OAuthProtectedResourceMetadataSchema,
  type AuthorizationServerMetadata,
  type OAuthClientInformationFull,
  type OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

import { MCP_SERVER_VERSION } from '@/backend/services/mcp/constants';
import { EgressBlockedError, createGuardedFetch, readCappedText } from '@/backend/shared/egress';
import {
  McpRemoteError,
  readAuthChallenge,
  scopeRequirementSentence,
  type McpConnectProbe,
  type McpDiscovery,
  type McpOAuthClient,
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
export {
  McpRemoteError,
  type McpDiscovery,
  type McpRemoteFailure,
} from '@/backend/shared/domain/mcp-remote';

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

/**
 * Whether the provider refused the grant itself.
 *
 * The SDK parses an OAuth error body into a class carrying `errorCode`, so the
 * check is on the code rather than on an imported class: this client speaks to
 * the SDK's client half, and a server-half class is an import this module does
 * not need to own.
 */
function isInvalidGrant(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { errorCode?: unknown }).errorCode === 'invalid_grant'
  );
}

/**
 * Whether the server refused the bearer token we presented.
 *
 * The transport raises `StreamableHTTPError` with the response's status in
 * `code`; 401 and 403 are both "this token does not open this server", which is
 * a refresh and a retry, not a protocol fault.
 */
function refusedToken(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 401 || code === 403;
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
   *
   * `preRegistered` is the one case a probe cannot measure: the row carries a
   * client we registered by hand, so a missing `registration_endpoint` — or a
   * provider that hides its metadata from a datacenter IP — is not a refusal.
   * The admin's reviewed entry is the verdict, and the probe still reads the
   * document when it can, for the brand mark.
   */
  probeConnectable(
    serverUrl: string | URL,
    options?: { preRegistered?: boolean }
  ): Promise<McpConnectProbe>;
  register(input: {
    discovery: McpDiscovery;
    redirectUri: string;
    clientName: string;
  }): Promise<McpRegistration>;
  /**
   * The URL the member is sent to, and the PKCE verifier that must survive until
   * the callback. The SDK builds it; the caller stores the verifier encrypted.
   *
   * `scopes` is only sent when a pre-registered client names them: a DCR
   * registration declares none on purpose (the provider's default is the
   * starting grant), and a hand-registered app has no default to fall back on.
   */
  authorizeUrl(input: {
    discovery: McpDiscovery;
    client: McpOAuthClient;
    redirectUri: string;
    state: string;
    scopes?: string[];
  }): Promise<{ url: string; codeVerifier: string }>;
  exchange(input: {
    discovery: McpDiscovery;
    client: McpOAuthClient;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<OAuthTokens>;
  refresh(input: {
    discovery: McpDiscovery;
    client: McpOAuthClient;
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
    client: McpOAuthClient;
    token: string;
    tokenTypeHint: 'access_token' | 'refresh_token';
  }): Promise<boolean>;
  /** `initialize` + `tools/list`, in one connection that is closed again. */
  listTools(input: { serverUrl: string | URL; accessToken: string }): Promise<McpRemoteTool[]>;
  /**
   * One `tools/call`, in one connection that is closed again (phase 4 / #1225).
   *
   * The answer is returned as the server wrote it, minus the protocol envelope:
   * `isError` is the server's own verdict about the call, and `content` is what
   * the model reads. Nothing here interprets either — a remote answer is data.
   */
  callTool(input: {
    serverUrl: string | URL;
    accessToken: string;
    name: string;
    args: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<McpRemoteCallResult>;
}

/** What a `tools/call` answered, reduced to what a turn can carry. */
export interface McpRemoteCallResult {
  /** The server's own `isError`: the call ran and refused, rather than failed. */
  isError: boolean;
  content: unknown;
  /** The structured answer, when the server publishes one. */
  structured: unknown;
}

interface ClientDependencies {
  /** Defaults to the guarded fetch; a test passes its own. */
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<Array<{ address: string }>>;
}

/** What the SDK holds for a registered client, in the shape its helpers want. */
function clientInformation(client: McpOAuthClient): OAuthClientInformationFull {
  return {
    client_id: client.clientId,
    ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
    // The SDK reads these when the server's metadata is silent about methods.
    redirect_uris: [],
    grant_types: ['authorization_code', 'refresh_token'],
    ...(client.tokenEndpointAuthMethod
      ? { token_endpoint_auth_method: client.tokenEndpointAuthMethod }
      : {}),
  } as OAuthClientInformationFull;
}

/** Where a server publishes its RFC 9728 document, or why none was found. */
interface ResourceMetadataDiscovery {
  /** The URL that answered with a usable document; `null` when none did. */
  resourceMetadataUrl: URL | null;
  /** True when the origin answered at least one HTTP response at all. */
  answered: boolean;
}

/** One well-known request, reduced to whether a usable document answered. */
async function readResourceMetadata(
  url: URL,
  fetchFn: typeof fetch
): Promise<{ answered: boolean; found: boolean }> {
  let response: Response;
  try {
    response = await fetchFn(url, { headers: { accept: 'application/json' } });
  } catch (error) {
    if (error instanceof EgressBlockedError) throw error;
    return { answered: false, found: false };
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { answered: true, found: false };
  }

  try {
    const parsed = OAuthProtectedResourceMetadataSchema.safeParse(
      JSON.parse(await readCappedText(response))
    );
    return { answered: true, found: parsed.success };
  } catch {
    // A 200 that is not a document (or is larger than the ceiling) is no
    // document, and the next source may still publish one.
    return { answered: true, found: false };
  }
}

/**
 * The three routes a server may publish its resource metadata on, in the order
 * that costs least:
 *
 * 1. the root document, `/.well-known/oauth-protected-resource`;
 * 2. the path-aware one, `/.well-known/oauth-protected-resource/<path>`;
 * 3. the URL a `401` on the MCP endpoint names in
 *    `WWW-Authenticate: Bearer resource_metadata="…"`.
 *
 * The second is the one that mattered: `observability.mcp.cloudflare.com/mcp`
 * answers `404` at the root and `200` at its path-aware address, and asking only
 * the root recorded a connectable server as `no_metadata` (issue #1270). The
 * third is what a server that only challenges a POST publishes.
 *
 * `answered` is what separates "publishes nothing" from "never answered": any
 * HTTP response at all means the host is up, which is the difference between
 * `no_metadata` and `unreachable` on the Admin Console.
 */
async function discoverResourceMetadata(
  serverUrl: string | URL,
  fetchFn: typeof fetch
): Promise<ResourceMetadataDiscovery> {
  const resource = new URL(String(serverUrl));
  const path = resource.pathname.replace(/\/+$/, '');

  const candidates = [new URL('/.well-known/oauth-protected-resource', resource)];
  if (path.length > 0) {
    candidates.push(new URL(`/.well-known/oauth-protected-resource${path}`, resource));
  }

  let answered = false;
  for (const candidate of candidates) {
    const document = await readResourceMetadata(candidate, fetchFn);
    answered = answered || document.answered;
    if (document.found) return { resourceMetadataUrl: candidate, answered };
  }

  try {
    const challenge = await fetchFn(resource, {
      headers: { accept: 'application/json, text/event-stream' },
    });
    answered = true;
    const named = extractWWWAuthenticateParams(challenge).resourceMetadataUrl;
    await challenge.body?.cancel().catch(() => undefined);

    if (named) {
      const document = await readResourceMetadata(named, fetchFn);
      answered = answered || document.answered;
      if (document.found) return { resourceMetadataUrl: named, answered };
    }
  } catch (error) {
    if (error instanceof EgressBlockedError) throw error;
  }

  return { resourceMetadataUrl: null, answered };
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
      // The same three-source resolution the probe uses, so the verdict an
      // admin reads is measured at the document the connect flow will read.
      const resource = await discoverResourceMetadata(serverUrl, guardedFetch);
      info = await discoverOAuthServerInfo(serverUrl, {
        fetchFn: guardedFetch,
        ...(resource.resourceMetadataUrl
          ? { resourceMetadataUrl: resource.resourceMetadataUrl }
          : {}),
      });
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

    async probeConnectable(serverUrl, { preRegistered = false } = {}) {
      /*
        A pre-registered client is the one verdict the probe cannot take away.
        The row carries a client we created by hand, so the two things discovery
        would refuse it for — no `registration_endpoint`, or a provider that
        hides its metadata from a datacenter IP — are the reasons it exists. The
        document is still read when it answers, for the brand mark; only the
        egress policy can still refuse the host.
      */
      if (preRegistered) {
        let logoUrl: string | null = null;
        let logoMime: string | null = null;
        try {
          const discovery = await discoverResourceMetadata(serverUrl, probeFetch);
          if (discovery.resourceMetadataUrl) {
            const info = await discoverOAuthServerInfo(serverUrl, {
              fetchFn: probeFetch,
              resourceMetadataUrl: discovery.resourceMetadataUrl,
            });
            logoUrl = resourceLogoUrl(info.resourceMetadata);
            logoMime = iconMimeFromUrl(logoUrl);
          }
        } catch (error) {
          if (error instanceof EgressBlockedError) {
            return { connectable: false, reason: 'blocked', logoUrl: null, logoMime: null };
          }
          // Measured by a person, not by this probe: keep the verdict.
        }
        return { connectable: true, reason: null, logoUrl, logoMime };
      }

      /*
        The three sources are asked explicitly, because the difference matters to
        the admin reading the verdict: a 404 at the root is not the end of the
        story (the path-aware document is behind it), and "publishes nothing" is
        not "never answered" — a timeout is recorded as `unreachable` rather than
        `no_metadata`, because a server that never answered is not a server that
        published nothing.
      */
      let discovery: ResourceMetadataDiscovery;
      try {
        discovery = await discoverResourceMetadata(serverUrl, probeFetch);
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

      if (!discovery.answered) {
        logger.warn('MCP marketplace: connectability probe got no answer', {
          url: String(serverUrl),
        });
        return { connectable: false, reason: 'unreachable', logoUrl: null, logoMime: null };
      }

      try {
        const info = await discoverOAuthServerInfo(serverUrl, {
          fetchFn: probeFetch,
          ...(discovery.resourceMetadataUrl
            ? { resourceMetadataUrl: discovery.resourceMetadataUrl }
            : {}),
        });
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

    async authorizeUrl({ discovery, client, redirectUri, state, scopes }) {
      try {
        const { authorizationUrl, codeVerifier } = await startAuthorization(
          discovery.authorizationServer,
          {
            metadata: discovery.metadata,
            clientInformation: clientInformation(client),
            redirectUrl: redirectUri,
            state,
            resource: discovery.resource,
            ...(scopes && scopes.length > 0 ? { scope: scopes.join(' ') } : {}),
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
        /*
          `invalid_grant` is the provider's own answer for a refresh token that
          is expired, revoked, or was already spent by a rotation. It is not a
          failure to retry: the connection needs the member's consent again, and
          the caller turns this into `needs_reauth` rather than a failed turn.
        */
        if (isInvalidGrant(error)) {
          throw new McpRemoteError(
            'reauth',
            'انتهت صلاحية الوصول إلى التطبيق. أعد ربطه من «تطبيقاتنا».',
            error
          );
        }
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

    async callTool({ serverUrl, accessToken, name, args, signal }) {
      const client = new Client(
        { name: 'royaraqamia', version: MCP_SERVER_VERSION },
        { capabilities: {} }
      );
      // A refusal's reason rides on the response the transport turns into an
      // error, and the error keeps only the status. So the challenge is read
      // here, at the one place that still holds it: `insufficient_scope` and
      // `invalid_token` are two different repairs, and a 403 cannot be told
      // apart from an expired grant without it (measured, Supabase
      // 2026-11-11).
      let challenge = '';
      const readingFetch: typeof fetch = async (input, init) => {
        const response = await guardedFetch(input, init);
        if (response.status === 401 || response.status === 403) {
          challenge = response.headers.get('www-authenticate') ?? '';
        }
        return response;
      };

      const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
        fetch: readingFetch,
        requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
      });

      try {
        await client.connect(transport);
        const result = await client.callTool({ name, arguments: args }, undefined, {
          signal,
        });
        return {
          isError: result.isError === true,
          content: result.content ?? null,
          structured: result.structuredContent ?? null,
        };
      } catch (error) {
        // A scope the grant never had is not a dead token: refreshing returns
        // the same grant, so retrying it would only spend a refresh and then
        // tell the member to reconnect a connection that still works.
        const refusal = readAuthChallenge(challenge);
        if (refusal.error === 'insufficient_scope') {
          throw new McpRemoteError(
            'scope',
            scopeRequirementSentence(refusal.scope),
            error,
            refusal.scope
          );
        }
        // A refused token is its own answer: the caller refreshes once and asks
        // again, and only a second refusal means the grant is gone.
        if (refusedToken(error)) {
          throw new McpRemoteError(
            'unauthorized',
            'رفض التطبيق صلاحية الوصول الحالية. سنحاول التجديد.',
            error
          );
        }
        mapFailure(error, 'protocol', 'تعذّر تنفيذ الأداة لدى التطبيق');
      } finally {
        await client.close().catch(() => undefined);
      }
    },
  };
}

/** Exported for the flow's own JSON reads, so the size ceiling is never skipped. */
export { readCappedText };
