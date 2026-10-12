import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { NextRequest } from 'next/server';
import { createMcpServer } from '@/backend/services/mcp/tools/registry';
import { authenticateMcpRequest } from '@/backend/middleware/mcp-auth';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { toNextResponse } from '@/backend/transport/http-result';
import { getClientIp } from '@/backend/transport/http';
import { mcpDataPlaneRateLimitPolicy } from '@/backend/config/rate-limiter';
import { corsHeaders, optionsResponse } from '@/backend/services/mcp/oauth-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Applies to POST/DELETE (tool calls can be slow). GET no longer needs a
// generous budget — see the note on the GET handler below.
export const maxDuration = 60;

/**
 * Public MCP endpoint (Streamable HTTP, stateless).
 *
 * Each request creates a fresh McpServer + transport bound to the caller's
 * resolved context, so no session state is kept between calls. The OAuth
 * access token travels in the `Authorization: Bearer` header and is resolved
 * to identity/scopes by the auth middleware. Callers without a token get an
 * anonymous context limited to the public tool surface (ADR 0021); anything
 * personal-data-shaped already answered 401 with an OAuth challenge there.
 */

async function handleRequest(request: NextRequest): Promise<Response> {
  const rateLimited = await checkRateLimitApi({
    ...mcpDataPlaneRateLimitPolicy(getClientIp(request)),
    failClosed: true,
  });
  if (rateLimited) return toNextResponse(rateLimited);

  const auth = await authenticateMcpRequest(request);
  if (auth instanceof Response) return auth;

  const server = createMcpServer(auth.ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(request, { authInfo: auth.authInfo });
}

function withCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function OPTIONS(): Promise<Response> {
  return optionsResponse();
}

export async function POST(request: NextRequest): Promise<Response> {
  return withCorsHeaders(await handleRequest(request));
}

/**
 * A stateless server has nothing to push, so the standalone SSE stream that the
 * Streamable HTTP transport opens on GET carries no data: the client holds the
 * connection until the platform kills it, then immediately reconnects.
 *
 * That cost was **2,779 sixty-second timeouts on `/mcp` in seven days**
 * (`Vercel Runtime Timeout Error`, 12 callers, one every ~61s while a client was
 * connected) — a function pinned for a full minute, every minute, per client.
 * It was the largest single consumer of Fluid Active CPU on this project, and it
 * also produced the `refreshSession failed` error storm through the reconnect
 * loop. Capping the route at 60s (what this replaced) only shortened each pin.
 *
 * The MCP Streamable HTTP spec allows exactly this answer: a server that does
 * not offer an SSE stream MUST reply to GET with 405. Clients then stay on
 * POST, which is all a stateless server needs. The response is cacheable so the
 * reconnect attempts are absorbed by the CDN instead of the function.
 */
export function GET(): Response {
  return withCorsHeaders(
    new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32000,
          message: 'This MCP server does not offer an SSE stream. Use POST.',
        },
      }),
      {
        status: 405,
        headers: {
          Allow: 'POST, DELETE, OPTIONS',
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=3600',
        },
      }
    )
  );
}

export async function DELETE(request: NextRequest): Promise<Response> {
  return withCorsHeaders(await handleRequest(request));
}
