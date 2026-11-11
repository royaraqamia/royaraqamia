import type { McpDiscovery } from '@/backend/shared/domain/mcp-remote';

/**
 * A client we registered with a provider by hand (issue #1229).
 *
 * Two providers cannot be reached by the flow we built, for two different
 * reasons: some publish no RFC 9728 resource metadata at all, and some publish
 * everything except `registration_endpoint` (RFC 7591). Both are refusals the
 * client is right to make — guessing an endpoint is how a consent screen sends a
 * member to a host nobody agreed to — so the alternative is a reviewed entry:
 * the endpoints a person measured, and a `client_id`/`client_secret` a person
 * created in that provider's console.
 *
 * The entry is **per catalogue row**, not per authorization server, because a
 * row is what a member taps and what an admin verifies. Its endpoints are the
 * provider's published ones, copied here with the date they were read; they are
 * not defaults, and an entry with no `client_id` in the environment is inert.
 */
export interface McpStaticClient {
  /** The catalogue row this client belongs to (`mcp_catalog_servers.registry_name`). */
  registryName: string;
  clientId: string;
  clientSecret: string | null;
  /** RFC 8414 issuer, recorded on the connection beside the tokens. */
  authorizationServer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint: string | null;
  /**
   * The scopes the app was registered for. Sent at authorization, unlike the
   * DCR path, because a hand-registered app has no provider default to fall
   * back on and an empty scope asks for almost nothing.
   */
  scopes: string[];
  tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'none';
}

/** The reviewed clients that are switched on, keyed by catalogue row. */
export type McpStaticClientMap = ReadonlyMap<string, McpStaticClient>;

/**
 * A pre-registered client's discovery, built without a socket.
 *
 * It is the same shape `discover` returns, so the connect flow, the token
 * refresh and the credential row do not branch on where the endpoints came
 * from — only on whether a registration is needed.
 */
export function staticClientDiscovery(client: McpStaticClient, serverUrl: string): McpDiscovery {
  return {
    resource: serverUrl,
    authorizationServer: client.authorizationServer,
    authorizationEndpoint: client.authorizationEndpoint,
    tokenEndpoint: client.tokenEndpoint,
    // The whole point: there is nothing to register, we already did.
    registrationEndpoint: null,
    scopes: client.scopes,
    logoUrl: null,
    metadata: {
      issuer: client.authorizationServer,
      authorization_endpoint: client.authorizationEndpoint,
      token_endpoint: client.tokenEndpoint,
      ...(client.revocationEndpoint ? { revocation_endpoint: client.revocationEndpoint } : {}),
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: [client.tokenEndpointAuthMethod],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: client.scopes,
    },
  };
}
