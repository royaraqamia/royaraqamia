import { NextRequest, NextResponse } from 'next/server';
import { createMcpOAuthProvider, McpOAuthError } from '@/backend/services/mcp/oauth-provider';
import { generateOpaqueToken } from '@/backend/repositories/mcp/mcp-token-crypto';
import { parseScopes } from '@/backend/services/mcp/scope';
import { noStore } from '@/backend/services/mcp/oauth-http';

export const runtime = 'nodejs';

/**
 * OAuth 2.0 Dynamic Client Registration endpoint (RFC 7591).
 *
 * Registers a public client (PKCE, token_endpoint_auth_method "none") or a
 * confidential client (client_secret_post / client_secret_basic) and returns
 * the client_id / client_secret to the caller. The MCP SDK performs this
 * automatically before the first authorization request.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'Request body must be valid JSON' },
      { status: 400, headers: noStore() }
    );
  }

  const redirectUris = body.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every((u) => typeof u === 'string')
  ) {
    return NextResponse.json(
      {
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uris must be a non-empty array of URLs',
      },
      { status: 400, headers: noStore() }
    );
  }

  const authMethod =
    body.token_endpoint_auth_method === 'client_secret_post' ||
    body.token_endpoint_auth_method === 'client_secret_basic'
      ? (body.token_endpoint_auth_method as 'client_secret_post' | 'client_secret_basic')
      : 'none';

  const clientName = typeof body.client_name === 'string' ? body.client_name : null;
  const scopes = parseScopes(typeof body.scope === 'string' ? body.scope : undefined);

  const provider = createMcpOAuthProvider();
  const clientId = generateOpaqueToken(16);
  const clientSecret = authMethod === 'none' ? undefined : generateOpaqueToken(32);

  try {
    const client = await provider.registerClient({
      clientId,
      clientName,
      redirectUris,
      clientSecret,
      scopes,
    });

    return NextResponse.json(
      {
        client_id: client.client_id,
        client_secret: clientSecret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        token_endpoint_auth_method: authMethod,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: client.scopes.join(' '),
      },
      { status: 201, headers: noStore() }
    );
  } catch (err) {
    if (err instanceof McpOAuthError) {
      return NextResponse.json(
        { error: err.code, error_description: err.errorDescription },
        { status: err.status, headers: noStore() }
      );
    }
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500, headers: noStore() }
    );
  }
}
