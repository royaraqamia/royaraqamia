import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveMcpContext, type McpUserContext } from '@/backend/services/mcp/session';
import { ALL_SCOPES } from '@/backend/services/mcp/scope';
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
 * Anonymous requests are rejected with a 401 `WWW-Authenticate: Bearer`
 * challenge (RFC 6750) pointing at the protected-resource metadata. This is
 * what makes the official MCP clients automatically launch the browser OAuth
 * flow on first connect — identical to how Supabase's hosted MCP behaves.
 * No token → challenge; a malformed or expired token → the same challenge.
 */

export interface McpAuthResult {
  ctx: McpUserContext;
  authInfo: AuthInfo;
}

function buildChallenge(request: NextRequest): string {
  const origin = new URL(request.url).origin;
  const resourceMetadata = `${origin}/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${resourceMetadata}", scope="${ALL_SCOPES.join(' ')}"`;
}

export async function authenticateMcpRequest(
  request: NextRequest
): Promise<McpAuthResult | NextResponse> {
  const authorization = request.headers.get('authorization');
  const bearer = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : null;

  const ctx = await resolveMcpContext(bearer);

  // Blanket challenge: anonymous callers (no/invalid token) get the 401 that
  // triggers the MCP client's automatic OAuth discovery + browser login.
  if (!ctx || !ctx.userId) {
    return NextResponse.json(
      {
        error: 'unauthorized',
        error_description:
          'Authentication required. Complete the OAuth flow to connect this MCP server.',
      },
      {
        status: 401,
        headers: { 'WWW-Authenticate': buildChallenge(request), 'Cache-Control': 'no-store' },
      }
    );
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
