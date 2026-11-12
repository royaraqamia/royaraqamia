import { describe, expect, it, vi } from 'vitest';

import { McpRemoteError, createMcpRemoteClient, type McpDiscovery } from '../mcp-remote';

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
  routes: Array<{
    match: (url: string) => boolean;
    body?: unknown;
    status?: number;
    headers?: Record<string, string>;
  }>
) {
  return vi.fn(async (input: string | URL, _init?: RequestInit) => {
    const url = String(input);
    for (const route of routes) {
      if (route.match(url)) {
        return new Response(JSON.stringify(route.body), {
          status: route.status ?? 200,
          headers: { 'content-type': 'application/json', ...route.headers },
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

describe('probeConnectable', () => {
  it('finds the path-aware document when the root answers 404', async () => {
    // Cloudflare's account server answers exactly this way: no root document,
    // a document at `/.well-known/oauth-protected-resource/mcp`.
    const remote = client([
      {
        match: (url: string) =>
          url === 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
        body: RESOURCE_METADATA,
      },
      { ...discoveryRoutes[1]!, match: () => true },
    ]);

    await expect(remote.probeConnectable('https://mcp.example.com/mcp')).resolves.toMatchObject({
      connectable: true,
      reason: null,
    });
  });

  it('reads the document a 401 on the MCP endpoint names', async () => {
    const remote = client([
      {
        match: (url: string) => url === 'https://mcp.example.com/mcp',
        status: 401,
        headers: {
          'www-authenticate':
            'Bearer realm="OAuth", resource_metadata="https://mcp.example.com/auth-metadata"',
        },
      },
      {
        match: (url: string) => url === 'https://mcp.example.com/auth-metadata',
        body: RESOURCE_METADATA,
      },
      { ...discoveryRoutes[1]!, match: () => true },
    ]);

    await expect(remote.probeConnectable('https://mcp.example.com/mcp')).resolves.toMatchObject({
      connectable: true,
      reason: null,
    });
  });

  it('does not call a root 404 a server that publishes nothing', async () => {
    // The root is missing, the path-aware document is missing, and the endpoint
    // challenges without naming one: still "no metadata", never "unreachable".
    const remote = client([
      { match: (url: string) => url === 'https://mcp.example.com/mcp', status: 401 },
    ]);

    await expect(remote.probeConnectable('https://mcp.example.com/mcp')).resolves.toMatchObject({
      connectable: false,
      reason: 'no_metadata',
    });
  });

  it('records a connectable server and the mark it publishes', async () => {
    const remote = client([
      {
        match: (url: string) => url.includes('/.well-known/oauth-protected-resource'),
        body: { ...RESOURCE_METADATA, logo_uri: 'https://cdn.example/linear.svg' },
      },
      discoveryRoutes[1]!,
    ]);

    await expect(remote.probeConnectable('https://mcp.example.com/mcp')).resolves.toEqual({
      connectable: true,
      reason: null,
      authMode: 'oauth',
      logoUrl: 'https://cdn.example/linear.svg',
      logoMime: 'image/svg+xml',
    });
  });

  it('drops an http logo rather than mixing it into the store', async () => {
    const remote = client([
      {
        match: (url: string) => url.includes('/.well-known/oauth-protected-resource'),
        body: { ...RESOURCE_METADATA, logo_uri: 'http://cdn.example/linear.svg' },
      },
      discoveryRoutes[1]!,
    ]);

    await expect(remote.probeConnectable('https://mcp.example.com/mcp')).resolves.toMatchObject({
      connectable: true,
      logoUrl: null,
      logoMime: null,
    });
  });

  it('says "no metadata" when the server answers but publishes nothing usable', async () => {
    const remote = client([]);

    await expect(remote.probeConnectable('https://mcp.example.com/mcp')).resolves.toMatchObject({
      connectable: false,
      reason: 'no_metadata',
    });
  });

  it('says "unreachable" when the server never answers', async () => {
    const remote = createMcpRemoteClient({
      fetchImpl: vi.fn(async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch,
      resolveHost: async () => PUBLIC,
    });

    await expect(remote.probeConnectable('https://mcp.example.com/mcp')).resolves.toMatchObject({
      connectable: false,
      reason: 'unreachable',
    });
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

/**
 * A discovery document whose registration lives away from the issuer's
 * `/register`. That is the shape Supabase has, and the shape that exposed the
 * production bug (#1215): handed an endpoint with no metadata, the SDK falls
 * back to the specification's default path and the provider answers 404.
 */
function discoveryAt(registrationEndpoint: string): McpDiscovery {
  return {
    resource: 'https://mcp.example.com/mcp',
    authorizationServer: 'https://auth.example.com',
    authorizationEndpoint: 'https://auth.example.com/authorize',
    tokenEndpoint: 'https://auth.example.com/token',
    registrationEndpoint,
    scopes: ['read'],
    logoUrl: null,
    metadata: {
      ...SERVER_METADATA,
      registration_endpoint: registrationEndpoint,
    } as McpDiscovery['metadata'],
  };
}

describe('register', () => {
  it('registers a public client at the endpoint the metadata names', async () => {
    const fetchImpl = fakeNetwork([
      {
        match: (url: string) => url.includes('/platform/oauth/apps/register'),
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
      discovery: discoveryAt('https://auth.example.com/platform/oauth/apps/register'),
      redirectUri: 'https://royaraqamia.com/mcp/callback',
      clientName: 'royaraqamia',
    });

    expect(registration).toEqual({
      clientId: 'registered-1',
      clientSecret: 'secret-1',
      kind: 'dcr',
    });

    // The exact URL the provider published — never `/register`.
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'https://auth.example.com/platform/oauth/apps/register'
    );

    const body = JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.redirect_uris).toEqual(['https://royaraqamia.com/mcp/callback']);
    expect(body.token_endpoint_auth_method).toBe('none');
    // No scopes are declared: the provider's own default is the starting grant.
    expect(body.scope).toBeUndefined();
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
        discovery: discoveryAt('https://auth.example.com/register'),
        redirectUri: 'https://royaraqamia.com/mcp/callback',
        clientName: 'royaraqamia',
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

/**
 * A fake MCP server that speaks just enough of the protocol for the SDK client:
 * `initialize`, the notification, and `tools/list` (#1269).
 *
 * The transport is real, so the header the client sends is the header a server
 * would receive — which is the only way to test that an API key lands in the
 * header the catalogue names and that a no-auth call sends none.
 */
function fakeMcpServer(expected?: { header: string; value: string }) {
  const seen: Array<{ path: string; headers: Record<string, string> }> = [];
  const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    seen.push({ path: url.pathname, headers: Object.fromEntries(headers.entries()) });

    if (url.pathname.startsWith('/.well-known')) {
      return new Response('not found', { status: 404 });
    }

    if (expected && headers.get(expected.header) !== expected.value) {
      return new Response('unauthorized', { status: 401 });
    }

    const body = init?.body ? String(init.body) : '';
    if (!body) return new Response(null, { status: 202 });
    const request = JSON.parse(body) as { id?: number; method?: string };

    if (request.method === 'initialize') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'example', version: '1.0.0' },
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json', 'mcp-session-id': 'session-1' },
        }
      );
    }

    if (request.method === 'tools/list') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: [
              {
                name: 'search',
                description: 'Search',
                inputSchema: { type: 'object' },
                annotations: { readOnlyHint: true },
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json', 'mcp-session-id': 'session-1' },
        }
      );
    }

    return new Response(null, { status: 202 });
  });

  return {
    seen,
    remote: createMcpRemoteClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolveHost: async () => PUBLIC,
    }),
  };
}

describe('the credential one request carries (#1269)', () => {
  it('sends a bearer token for an OAuth connection', async () => {
    const { remote, seen } = fakeMcpServer({ header: 'authorization', value: 'Bearer access-1' });

    const tools = await remote.listTools({
      serverUrl: 'https://mcp.example.com/mcp',
      auth: { kind: 'bearer', token: 'access-1' },
    });

    expect(tools.map((tool) => tool.name)).toEqual(['search']);
    expect(seen.some((call) => call.headers.authorization === 'Bearer access-1')).toBe(true);
  });

  it('sends a member key in the header the row names, and in no other place', async () => {
    const { remote, seen } = fakeMcpServer({ header: 'x-api-key', value: 'sk-live-1' });

    await remote.listTools({
      serverUrl: 'https://mcp.example.com/mcp',
      auth: { kind: 'api_key', header: 'X-API-Key', value: 'sk-live-1' },
    });

    expect(seen.every((call) => !call.path.includes('sk-live-1'))).toBe(true);
    expect(seen.some((call) => call.headers['x-api-key'] === 'sk-live-1')).toBe(true);
    expect(seen.every((call) => call.headers.authorization === undefined)).toBe(true);
  });

  it('sends no authorization at all for a no-auth connection', async () => {
    const { remote, seen } = fakeMcpServer();

    await remote.listTools({
      serverUrl: 'https://mcp.example.com/mcp',
      auth: { kind: 'none' },
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((call) => call.headers.authorization === undefined)).toBe(true);
    expect(seen.every((call) => call.headers['x-api-key'] === undefined)).toBe(true);
  });
});

describe('probing a row that carries an auth mode (#1269)', () => {
  it('measures a no-auth row that answers without a credential', async () => {
    const { remote } = fakeMcpServer();

    await expect(
      remote.probeConnectable('https://mcp.example.com/mcp', { authMode: 'none' })
    ).resolves.toMatchObject({ connectable: true, reason: null, authMode: 'none' });
  });

  it('refuses a no-auth row whose server answers 401, and names what it measured', async () => {
    const { remote } = fakeMcpServer({ header: 'x-api-key', value: 'anything' });

    await expect(
      remote.probeConnectable('https://mcp.example.com/mcp', { authMode: 'none' })
    ).resolves.toMatchObject({
      connectable: false,
      reason: 'needs_credentials',
      authMode: 'api_key',
    });
  });

  it('reads a bearer challenge as an OAuth endpoint, not as a key server', async () => {
    const remote = createMcpRemoteClient({
      fetchImpl: vi.fn(async (input: string | URL) => {
        const url = new URL(String(input));
        if (url.pathname.startsWith('/.well-known')) return new Response('no', { status: 404 });
        return new Response('no', {
          status: 401,
          headers: { 'www-authenticate': 'Bearer realm="OAuth"' },
        });
      }) as unknown as typeof fetch,
      resolveHost: async () => PUBLIC,
    });

    await expect(
      remote.probeConnectable('https://mcp.example.com/mcp', { authMode: 'none' })
    ).resolves.toMatchObject({
      connectable: false,
      reason: 'needs_credentials',
      authMode: 'oauth',
    });
  });

  it('links an api_key row once the endpoint answers a credential challenge', async () => {
    const { remote } = fakeMcpServer({ header: 'authorization', value: 'Bearer key' });

    await expect(
      remote.probeConnectable('https://mcp.example.com/mcp', { authMode: 'api_key' })
    ).resolves.toMatchObject({ connectable: true, reason: null, authMode: 'api_key' });
  });

  it('names a no-auth server a row still calls OAuth, without switching the row', async () => {
    // The Cloudflare docs server, measured 2026-11-12: everything under
    // /.well-known is a 404 and `initialize` answers without a credential.
    const { remote } = fakeMcpServer();

    await expect(remote.probeConnectable('https://mcp.example.com/mcp')).resolves.toMatchObject({
      connectable: false,
      reason: 'no_metadata',
      authMode: 'none',
    });
  });
});
