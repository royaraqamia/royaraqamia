import type {
  McpStaticClient,
  McpStaticClientMap,
} from '@/backend/shared/domain/mcp-static-clients';

/**
 * The pre-registered clients, reviewed one row at a time (issue #1229).
 *
 * A provider lands here only after someone measured its endpoints and created
 * an OAuth app in its console. There is no fallback: a row absent from this
 * table is still discovered, and still refused when it publishes no
 * `registration_endpoint`. The environment supplies only the pair a console
 * issued — `MCP_STATIC_CLIENT_<KEY>_ID` and `MCP_STATIC_CLIENT_<KEY>_SECRET` —
 * so the code stays reviewable and the secret never enters the repository.
 */
interface McpStaticClientDefinition extends Omit<McpStaticClient, 'clientId' | 'clientSecret'> {
  /** The environment key suffix: `GITHUB` reads `MCP_STATIC_CLIENT_GITHUB_ID`. */
  envKey: string;
}

const DEFINITIONS: readonly McpStaticClientDefinition[] = [
  {
    registryName: 'com.github/mcp',
    envKey: 'GITHUB',
    /*
      Measured 2026-11-11 against `https://api.githubcopilot.com/mcp/`:
      the resource document names `https://github.com/login/oauth`, whose
      metadata (`/.well-known/oauth-authorization-server/login/oauth`) publishes
      an authorization and a token endpoint and **no** `registration_endpoint`.
      That is the refusal this table exists for.

      The scopes are the ones the resource document publishes and the tools
      need: repositories, organizations, the signed-in user, and projects.
      `gist`, `notifications` and `write:packages` are published too and left
      out — a consent screen asks for what the agent can use, not for the widest
      grant the provider offers.
    */
    authorizationServer: 'https://github.com/login/oauth',
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    // OAuth Apps have no RFC 7009 endpoint; the local delete is the disconnect.
    revocationEndpoint: null,
    scopes: ['repo', 'read:org', 'read:user', 'user:email', 'read:project'],
    tokenEndpointAuthMethod: 'client_secret_post',
  },
];

/**
 * The definitions whose credentials exist, keyed by catalogue row.
 *
 * A definition with no `client_id` is skipped rather than half-configured: the
 * row then behaves exactly as it did before this table existed, and the store's
 * verdict says so. Reading the environment here — and only here — keeps a
 * secret out of every service and every test.
 */
export function readMcpStaticClients(
  env: Record<string, string | undefined> = process.env
): McpStaticClientMap {
  const clients = new Map<string, McpStaticClient>();

  for (const { envKey, ...definition } of DEFINITIONS) {
    const clientId = env[`MCP_STATIC_CLIENT_${envKey}_ID`]?.trim();
    if (!clientId) continue;

    const clientSecret = env[`MCP_STATIC_CLIENT_${envKey}_SECRET`]?.trim() || null;
    clients.set(definition.registryName, { ...definition, clientId, clientSecret });
  }

  return clients;
}

/** Every row this table could cover, whether or not its secret is present. */
export const MCP_STATIC_CLIENT_REGISTRY_NAMES: readonly string[] = DEFINITIONS.map(
  (definition) => definition.registryName
);
