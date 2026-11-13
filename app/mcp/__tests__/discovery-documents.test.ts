import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GET as authorizationServer,
  OPTIONS,
} from '@/app/.well-known/oauth-authorization-server/route';
import { GET as protectedResource } from '@/app/.well-known/oauth-protected-resource/route';

/**
 * The documents a client reads before it dials anything (ADR-0178). They take no
 * request, so the only thing that can decide their URLs is the configured origin.
 */
describe('MCP discovery documents', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function configure(origin: string) {
    vi.stubEnv('PUBLIC_ORIGIN', origin);
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin);
  }

  it('advertise the configured origin as issuer and resource', async () => {
    configure('https://royaraqamia.com');

    const authServer = await (await authorizationServer()).json();
    expect(authServer.issuer).toBe('https://royaraqamia.com');
    expect(authServer.authorization_endpoint).toBe('https://royaraqamia.com/mcp/authorize');

    const resource = await (await protectedResource()).json();
    expect(resource.resource).toBe('https://royaraqamia.com/mcp');
    expect(resource.authorization_servers).toEqual(['https://royaraqamia.com']);
  });

  it('follow a different origin without a request to derive it from', async () => {
    configure('https://preview.example.com');

    const authServer = await (await authorizationServer()).json();
    expect(authServer.issuer).toBe('https://preview.example.com');

    const resource = await (await protectedResource()).json();
    expect(resource.resource).toBe('https://preview.example.com/mcp');
  });

  it('answer CORS preflight so a browser client can read them', async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});
