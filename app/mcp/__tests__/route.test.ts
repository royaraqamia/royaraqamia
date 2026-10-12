import { describe, it, expect, vi } from 'vitest';

/**
 * `GET /mcp` must never open the transport again.
 *
 * Holding the stateless SSE stream open cost 2,779 sixty-second timeouts in
 * seven days (see `app/mcp/route.ts`), which was the largest consumer of Fluid
 * Active CPU on this project. The heavy modules below are mocked so the test
 * asserts the handler contract without booting the MCP registry.
 */
vi.mock('@/backend/services/mcp/tools/registry', () => ({ createMcpServer: vi.fn() }));
vi.mock('@/backend/middleware/mcp-auth', () => ({ authenticateMcpRequest: vi.fn() }));
vi.mock('@/backend/middleware/http', () => ({ checkRateLimitApi: vi.fn() }));
vi.mock('@/backend/transport/http-result', () => ({ toNextResponse: vi.fn() }));
vi.mock('@/backend/transport/http', () => ({ getClientIp: vi.fn() }));
vi.mock('@/backend/config/rate-limiter', () => ({ mcpDataPlaneRateLimitPolicy: () => ({}) }));
vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: class {},
}));

import { GET } from '@/app/mcp/route';

describe('GET /mcp', () => {
  it('answers 405 instead of opening a stream that no one can complete', async () => {
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST, DELETE, OPTIONS');
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=3600');
  });

  it('keeps CORS readable for browser-based MCP clients', async () => {
    const response = GET();

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('does no I/O at all — no rate limit call, no auth, no transport', async () => {
    const { checkRateLimitApi } = await import('@/backend/middleware/http');
    const { authenticateMcpRequest } = await import('@/backend/middleware/mcp-auth');

    GET();

    expect(checkRateLimitApi).not.toHaveBeenCalled();
    expect(authenticateMcpRequest).not.toHaveBeenCalled();
  });
});
