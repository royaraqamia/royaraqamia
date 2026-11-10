import { describe, expect, it, vi } from 'vitest';

import { McpRemoteError, createMcpRemoteClient } from '../mcp-remote';

/**
 * The third-party client, tested against a fake network: what matters is that
 * discovery is read as the specification names it, that a server which publishes
 * nothing is refused rather than guessed at, and that every call goes through the
 * guarded `fetch` (a private redirect is refused by the policy, not by luck).
 */

const PUBLIC = [{ address: '93.184.216.34' }];

const RESOURCE_METADATA = {
  resource: 'https://mcp.example.com/mcp',
  authorization_servers: ['https://auth.example.com'],
};

const SERVER_METADATA = {
  issuer: 'https://auth.example.com',
  authorization_endpoint: 'https://auth.example.com/authorize',
  token_endpoint: 'https://auth.example.com/token',
  registration_endpoint: 'https://auth.example.com/register',
  scopes_supported: ['read', 'write'],
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
};

function fakeNetwork(
  routes: Array<{ match: (url: string) => boolean; body: unknown; status?: number }>
) {
  return vi.fn(async (input: string | URL, _init?: RequestInit) => {
    const url = String(input);
    for (const route of routes) {
      if (route.match(url)) {
        return new Response(JSON.stringify(route.body), {
          status: route.status ?? 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return new Response('not found', { status: 404 });
  });
}

function client(routes: Parameters<typeof fakeNetwork>[0]) {
  return createMcpRemoteClient({
    fetchImpl: fakeNetwork(routes) as unknown as typeof fetch,
    resolveHost: async () => PUBLIC,
  });
}

const discoveryRoutes = [
  {
    match: (url: string) => url.includes('/.well-known/oauth-protected-resource'),
    body: RESOURCE_METADATA,
  },
  {
    match: (url: string) => url.includes('/.well-known/oauth-authorization-server'),
    body: SERVER_METADATA,
  },
];

describe('discover', () => {
  it('reads the authorization server out of the resource metadata', async () => {
    const discovery = await client(discoveryRoutes).discover('https://mcp.example.com/mcp');

    expect(discovery.authorizationServer).toBe('https://auth.example.com');
    expect(discovery.authorizationEndpoint).toBe('https://auth.example.com/authorize');
    expect(discovery.tokenEndpoint).toBe('https://auth.example.com/token');
    expect(discovery.registrationEndpoint).toBe('https://auth.example.com/register');
    expect(discovery.scopes).toEqual(['read', 'write']);
  });

  it('refuses a server that publishes no authorization metadata', async () => {
    const remote = client([
      discoveryRoutes[0]!,
      // A well-formed document with no endpoints is the shape a broken server
      // answers with; guessing defaults is what this refusal exists to stop.
      {
        match: (url: string) => url.includes('/.well-known/oauth-authorization-server'),
        body: { issuer: 'https://auth.example.com' },
      },
    ]);

    await expect(remote.discover('https://mcp.example.com/mcp')).rejects.toMatchObject({
      failure: 'discovery',
    });
  });

  it('reports a blocked host as blocked, not as an unreachable server', async () => {
    const remote = createMcpRemoteClient({
      fetchImpl: vi.fn() as unknown as typeof fetch,
      resolveHost: async () => [{ address: '10.0.0.5' }],
    });

    const error = await remote.discover('https://internal.example.com/mcp').catch((e) => e);

    expect(error).toBeInstanceOf(McpRemoteError);
    expect(error.failure).toBe('blocked');
  });
});

describe('authorizeUrl', () => {
  it('carries the client, the redirect, the state, the resource and a PKCE challenge', async () => {
    const remote = client(discoveryRoutes);
    const discovery = await remote.discover('https://mcp.example.com/mcp');

    const { url, codeVerifier } = await remote.authorizeUrl({
      discovery,
      client: { clientId: 'client-1', clientSecret: null },
      redirectUri: 'https://royaraqamia.com/mcp/callback',
      state: 'state-1',
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://auth.example.com/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('client-1');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://royaraqamia.com/mcp/callback');
    expect(parsed.searchParams.get('state')).toBe('state-1');
    expect(parsed.searchParams.get('resource')).toBe('https://mcp.example.com/mcp');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('code_challenge')).toBeTruthy();
    expect(codeVerifier.length).toBeGreaterThan(20);
  });
});

describe('register', () => {
  it('registers a public client at the registration endpoint', async () => {
    const fetchImpl = fakeNetwork([
      {
        match: (url: string) => url.includes('/register'),
        body: {
          client_id: 'registered-1',
          client_secret: 'secret-1',
          redirect_uris: ['https://royaraqamia.com/mcp/callback'],
        },
        status: 201,
      },
    ]);
    const remote = createMcpRemoteClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolveHost: async () => PUBLIC,
    });

    const registration = await remote.register({
      registrationEndpoint: 'https://auth.example.com/register',
      redirectUri: 'https://royaraqamia.com/mcp/callback',
      clientName: 'royaraqamia',
      scopes: ['read'],
    });

    expect(registration).toEqual({
      clientId: 'registered-1',
      clientSecret: 'secret-1',
      kind: 'dcr',
    });

    const body = JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.redirect_uris).toEqual(['https://royaraqamia.com/mcp/callback']);
    expect(body.token_endpoint_auth_method).toBe('none');
  });

  it('refuses when the server rejects the registration', async () => {
    const remote = createMcpRemoteClient({
      fetchImpl: fakeNetwork([
        {
          match: (url: string) => url.includes('/register'),
          body: { error: 'invalid' },
          status: 400,
        },
      ]) as unknown as typeof fetch,
      resolveHost: async () => PUBLIC,
    });

    await expect(
      remote.register({
        registrationEndpoint: 'https://auth.example.com/register',
        redirectUri: 'https://royaraqamia.com/mcp/callback',
        clientName: 'royaraqamia',
        scopes: [],
      })
    ).rejects.toMatchObject({ failure: 'registration' });
  });
});

describe('exchange', () => {
  it('posts the code with its verifier and returns the token set', async () => {
    const fetchImpl = fakeNetwork([
      {
        match: (url: string) => url.endsWith('/token'),
        body: {
          access_token: 'access-1',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'refresh-1',
        },
      },
    ]);
    const remote = createMcpRemoteClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolveHost: async () => PUBLIC,
    });

    const discovery = await client(discoveryRoutes).discover('https://mcp.example.com/mcp');
    const tokens = await remote.exchange({
      discovery,
      client: { clientId: 'client-1', clientSecret: null },
      code: 'code-1',
      codeVerifier: 'verifier-1',
      redirectUri: 'https://royaraqamia.com/mcp/callback',
    });

    expect(tokens.access_token).toBe('access-1');
    expect(tokens.refresh_token).toBe('refresh-1');

    const form = new URLSearchParams(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body));
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('code-1');
    expect(form.get('code_verifier')).toBe('verifier-1');
    expect(form.get('client_id')).toBe('client-1');
  });
});

describe('refresh', () => {
  it('keeps the original refresh token when the server does not rotate it', async () => {
    const remote = createMcpRemoteClient({
      fetchImpl: fakeNetwork([
        {
          match: (url: string) => url.endsWith('/token'),
          body: { access_token: 'access-2', token_type: 'Bearer', expires_in: 60 },
        },
      ]) as unknown as typeof fetch,
      resolveHost: async () => PUBLIC,
    });

    const discovery = await client(discoveryRoutes).discover('https://mcp.example.com/mcp');
    const tokens = await remote.refresh({
      discovery,
      client: { clientId: 'client-1', clientSecret: null },
      refreshToken: 'refresh-1',
    });

    expect(tokens.access_token).toBe('access-2');
    expect(tokens.refresh_token).toBe('refresh-1');
  });
});
