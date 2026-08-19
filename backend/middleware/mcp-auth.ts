import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveMcpContext, type McpUserContext } from '@/backend/services/mcp/session';
import { mcpResourceUrl } from '@/backend/services/mcp/oauth-metadata';

/**
 * Authenticates an incoming MCP request:
 * - Parses the `Authorization: Bearer <opaque token>` header.
 * - Resolves the bearer token to a user context (or an anonymous context when
 *   no token is present).
 * - Builds the SDK `AuthInfo` that the streamable-HTTP transport attaches to
 *   every request handler, so tools can read identity/scopes from
 *   `extra.authInfo`.
 *
 * A malformed or expired token yields a 401 JSON response; anonymous requests
 * (no Authorization header) are allowed and resolved to an anonymous context.
 */

export interface McpAuthResult {
  ctx: McpUserContext;
  authInfo: AuthInfo;
}

export async function authenticateMcpRequest(
  request: NextRequest
): Promise<McpAuthResult | NextResponse> {
  const authorization = request.headers.get('authorization');
  const bearer = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : null;

  const ctx = await resolveMcpContext(bearer);

  if (bearer && !ctx) {
    return NextResponse.json(
      { error: 'invalid_token', error_description: 'The access token is invalid or has expired.' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' } }
    );
  }

  // `resolveMcpContext` always returns a context for null/undefined tokens
  // (anonymous), so ctx is non-null here.
  const resolved = ctx as McpUserContext;

  const base = new URL(request.url).origin;
  const authInfo: AuthInfo = {
    token: bearer ?? '',
    clientId: resolved.clientId ?? '',
    scopes: resolved.scopes,
    expiresAt: resolved.tokenExpiresAt ? Math.floor(resolved.tokenExpiresAt / 1000) : undefined,
    resource: new URL(mcpResourceUrl(base)),
    extra: {
      userId: resolved.userId,
      email: resolved.email,
      isAdmin: resolved.isAdmin,
    },
  };

  return { ctx: resolved, authInfo };
}

/** Extract the bearer token from an authorization header, if any. */
export function extractBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  return authorization.slice('Bearer '.length).trim() || null;
}
