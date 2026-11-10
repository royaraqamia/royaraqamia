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
import { McpRemoteError, type McpRemoteFailure } from '@/backend/shared/domain/mcp-remote';
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

export interface McpRemoteClient {
  discover(serverUrl: string | URL): Promise<McpDiscovery>;
  register(input: {
    registrationEndpoint: string;
    redirectUri: string;
    clientName: string;
    scopes: string[];
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
      metadata,
    };
  }

  return {
    discover,

    async register({ registrationEndpoint, redirectUri, clientName, scopes }) {
      try {
        const registered = await registerClient(registrationEndpoint, {
          fetchFn: guardedFetch,
          clientMetadata: {
            client_name: clientName,
            redirect_uris: [redirectUri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            ...(scopes.length > 0 ? { scope: scopes.join(' ') } : {}),
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
