import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { NextRequest } from 'next/server';
import { createMcpServer } from '@/backend/services/mcp/tools/registry';
import { authenticateMcpRequest } from '@/backend/middleware/mcp-auth';
import { corsHeaders, optionsResponse } from '@/backend/services/mcp/oauth-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Stateless mode never pushes server-initiated events, but SDK GET requests
// still open a standalone SSE stream that some clients hold open forever.
// Cap the function so a lingering stream cannot pin an execution to the
// platform maximum (observed 300s timeouts in production).
export const maxDuration = 60;

/**
 * Public MCP endpoint (Streamable HTTP, stateless).
 *
 * Each request creates a fresh McpServer + transport bound to the caller's
 * resolved context, so no session state is kept between calls. The OAuth
 * access token travels in the `Authorization: Bearer` header and is resolved
 * to identity/scopes by the auth middleware; anonymous callers get an
 * anonymous context and may only reach scope-free/public tools.
 */

async function handleRequest(request: NextRequest): Promise<Response> {
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

export async function GET(request: NextRequest): Promise<Response> {
  return withCorsHeaders(await handleRequest(request));
}

export async function DELETE(request: NextRequest): Promise<Response> {
  return withCorsHeaders(await handleRequest(request));
}
