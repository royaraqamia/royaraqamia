import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveMcpContext, type McpUserContext } from '@/backend/services/mcp/session';
import { ALL_SCOPES } from '@/backend/services/mcp/scope';
import { PUBLIC_TOOL_NAMES } from '@/backend/services/mcp/public-tools';
import { mcpResourceUrl } from '@/backend/services/mcp/oauth-metadata';

/**
 * Authenticates an incoming MCP request (dual-mode, ADR 0021):
 * - Parses the `Authorization: Bearer <opaque token>` header.
 * - A present-but-invalid token always gets a 401 challenge — an anonymous
 *   downgrade for a would-be authenticated caller is never acceptable.
 * - A tokenless caller resolves to an anonymous context and may only reach
 *   the public surface: everything except `tools/call` (initialize, tools/list)
 *   plus the public tool names in `PUBLIC_TOOL_NAMES`. Anything else gets the
 *   401 `WWW-Authenticate: Bearer` challenge (RFC 6750) pointing at the
 *   protected-resource metadata — that is what makes the official MCP clients
 *   automatically launch the browser OAuth flow on first connect.
 * - Builds the SDK `AuthInfo` that the streamable-HTTP transport attaches to
 *   every request handler, so tools can read identity/scopes from
 *   `extra.authInfo`.
 */

export interface McpAuthResult {
  ctx: McpUserContext;
  authInfo: AuthInfo;
}

interface JsonRpcEntry {
  method?: unknown;
  params?: unknown;
}

function entryToolName(entry: JsonRpcEntry): unknown {
  if (typeof entry.params !== 'object' || entry.params === null) return undefined;
  return (entry.params as Record<string, unknown>).name;
}

/**
 * Whether the caller may reach the endpoint without an access token:
 * anything that is not a `tools/call` (initialize, tools/list, notifications,
 * SSE GET, DELETE teardown) counts as public; a `tools/call` only counts as
 * public when the named tool is in `PUBLIC_TOOL_NAMES`. A body that cannot be
 * parsed as JSON-RPC is treated as protected.
 */
export async function isPublicMcpRequest(request: NextRequest): Promise<boolean> {
  if (request.method.toUpperCase() !== 'POST') return true;

  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return false;
  }

  const entries = Array.isArray(body) ? body : [body];
  return entries.every(
    (entry) =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as JsonRpcEntry).method === 'string' &&
      ((entry as JsonRpcEntry).method !== 'tools/call' ||
        PUBLIC_TOOL_NAMES.has(entryToolName(entry as JsonRpcEntry) as string))
  );
}

function challengeResponse(request: NextRequest): NextResponse {
  const origin = new URL(request.url).origin;
  const resourceMetadata = `${origin}/.well-known/oauth-protected-resource`;
  return NextResponse.json(
    {
      error: 'unauthorized',
      error_description:
        'Authentication required. Complete the OAuth flow to connect this MCP server.',
    },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadata}", scope="${ALL_SCOPES.join(' ')}"`,
        'Cache-Control': 'no-store',
      },
    }
  );
}

export async function authenticateMcpRequest(
  request: NextRequest
): Promise<McpAuthResult | NextResponse> {
  const authorization = request.headers.get('authorization');
  const bearer = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : null;

  const ctx = await resolveMcpContext(bearer);

  if (!ctx) return challengeResponse(request);

  if (ctx.userId === null && !(await isPublicMcpRequest(request))) {
    return challengeResponse(request);
  }

  const base = new URL(request.url).origin;
  const authInfo: AuthInfo = {
    token: bearer ?? '',
    clientId: ctx.clientId ?? '',
    scopes: ctx.scopes,
    expiresAt: ctx.tokenExpiresAt ? Math.floor(ctx.tokenExpiresAt / 1000) : undefined,
    resource: new URL(mcpResourceUrl(base)),
    extra: {
      userId: ctx.userId,
      email: ctx.email,
      isAdmin: ctx.isAdmin,
    },
  };

  return { ctx, authInfo };
}

/** Extract the bearer token from an authorization header, if any. */
export function extractBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  return authorization.slice('Bearer '.length).trim() || null;
}
