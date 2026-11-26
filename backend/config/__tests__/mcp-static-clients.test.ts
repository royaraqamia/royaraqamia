import { describe, expect, it } from 'vitest';

import { readMcpStaticClients } from '@/backend/config/mcp-static-clients';
import { staticClientDiscovery } from '@/backend/shared/domain/mcp-static-clients';

/**
 * The reviewed table is the one place a secret is read, so what these tests pin
 * is the switch: a definition with no `client_id` must leave the row exactly as
 * the dynamic flow found it, and a configured one must carry the endpoints a
 * person measured rather than a guess. GitHub has no entry: the coding agent's
 * GitHub App is the only door to a member's repositories.
 */
describe('readMcpStaticClients', () => {
  it('is empty when no client is configured', () => {
    expect(readMcpStaticClients({}).size).toBe(0);
  });

  it('switches a definition on only when its client id exists', () => {
    const clients = readMcpStaticClients({ MCP_STATIC_CLIENT_VERCEL_SECRET: 'secret' });
    expect(clients.size).toBe(0);
  });

  it('reads the Vercel pair from the reviewed endpoints, not from discovery', () => {
    const clients = readMcpStaticClients({
      MCP_STATIC_CLIENT_VERCEL_ID: 'vercel-client-id',
      MCP_STATIC_CLIENT_VERCEL_SECRET: 'vercel-client-secret',
    });

    const vercel = clients.get('com.vercel/vercel-mcp');
    expect(vercel).toMatchObject({
      clientId: 'vercel-client-id',
      clientSecret: 'vercel-client-secret',
      authorizationServer: 'https://vercel.com',
      authorizationEndpoint: 'https://vercel.com/oauth/authorize',
      tokenEndpoint: 'https://api.vercel.com/login/oauth/token',
      revocationEndpoint: 'https://api.vercel.com/login/oauth/token/revoke',
      tokenEndpointAuthMethod: 'client_secret_post',
    });
    expect(vercel?.scopes).toEqual(['openid', 'email', 'profile']);
  });

  it('has no static client for GitHub, whose App is the single door', () => {
    const clients = readMcpStaticClients({
      MCP_STATIC_CLIENT_GITHUB_ID: 'client-id',
      MCP_STATIC_CLIENT_GITHUB_SECRET: 'client-secret',
    });
    expect(clients.has('com.github/mcp')).toBe(false);
  });

  it('treats a blank id as absent', () => {
    expect(readMcpStaticClients({ MCP_STATIC_CLIENT_VERCEL_ID: '   ' }).size).toBe(0);
  });
});

describe('staticClientDiscovery', () => {
  it('builds the same shape discovery returns, with nothing left to register', () => {
    const [client] = readMcpStaticClients({
      MCP_STATIC_CLIENT_VERCEL_ID: 'client-id',
      MCP_STATIC_CLIENT_VERCEL_SECRET: 'client-secret',
    }).values();

    const discovery = staticClientDiscovery(client!, 'https://mcp.vercel.com');

    expect(discovery).toMatchObject({
      resource: 'https://mcp.vercel.com',
      authorizationServer: 'https://vercel.com',
      authorizationEndpoint: 'https://vercel.com/oauth/authorize',
      tokenEndpoint: 'https://api.vercel.com/login/oauth/token',
      registrationEndpoint: null,
      scopes: client!.scopes,
    });
    expect(discovery.metadata).toMatchObject({
      issuer: 'https://vercel.com',
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      code_challenge_methods_supported: ['S256'],
    });
  });
});
