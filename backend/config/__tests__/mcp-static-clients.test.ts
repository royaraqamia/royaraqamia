import { describe, expect, it } from 'vitest';

import { readMcpStaticClients } from '@/backend/config/mcp-static-clients';
import { staticClientDiscovery } from '@/backend/shared/domain/mcp-static-clients';

/**
 * The reviewed table is the one place a secret is read, so what these tests pin
 * is the switch: a definition with no `client_id` must leave the row exactly as
 * the dynamic flow found it, and a configured one must carry the endpoints a
 * person measured rather than a guess.
 */
describe('readMcpStaticClients', () => {
  it('is empty when no client is configured', () => {
    expect(readMcpStaticClients({}).size).toBe(0);
  });

  it('switches a definition on only when its client id exists', () => {
    const clients = readMcpStaticClients({ MCP_STATIC_CLIENT_GITHUB_SECRET: 'secret' });
    expect(clients.size).toBe(0);
  });

  it('reads the pair for the row the definition names', () => {
    const clients = readMcpStaticClients({
      MCP_STATIC_CLIENT_GITHUB_ID: 'client-id',
      MCP_STATIC_CLIENT_GITHUB_SECRET: 'client-secret',
    });

    const github = clients.get('com.github/mcp');
    expect(github).toMatchObject({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      authorizationServer: 'https://github.com/login/oauth',
      authorizationEndpoint: 'https://github.com/login/oauth/authorize',
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
      tokenEndpointAuthMethod: 'client_secret_post',
    });
    expect(github?.scopes).toContain('repo');
  });

  it('treats a blank id as absent', () => {
    expect(readMcpStaticClients({ MCP_STATIC_CLIENT_GITHUB_ID: '   ' }).size).toBe(0);
  });
});

describe('staticClientDiscovery', () => {
  it('builds the same shape discovery returns, with nothing left to register', () => {
    const [client] = readMcpStaticClients({
      MCP_STATIC_CLIENT_GITHUB_ID: 'client-id',
      MCP_STATIC_CLIENT_GITHUB_SECRET: 'client-secret',
    }).values();

    const discovery = staticClientDiscovery(client!, 'https://api.githubcopilot.com/mcp/');

    expect(discovery).toMatchObject({
      resource: 'https://api.githubcopilot.com/mcp/',
      authorizationServer: 'https://github.com/login/oauth',
      authorizationEndpoint: 'https://github.com/login/oauth/authorize',
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
      registrationEndpoint: null,
      scopes: client!.scopes,
    });
    expect(discovery.metadata).toMatchObject({
      issuer: 'https://github.com/login/oauth',
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      code_challenge_methods_supported: ['S256'],
    });
  });
});
