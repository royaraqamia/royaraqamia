import { NextRequest, NextResponse } from 'next/server';
import { createMcpOAuthProvider, McpOAuthError } from '@/backend/services/mcp/oauth-provider';
import { basicAuthCredentials, noStore } from '@/backend/services/mcp/oauth-http';

export const runtime = 'nodejs';

/**
 * OAuth 2.0 token revocation endpoint (RFC 7009).
 *
 * Revokes an access or refresh token. Unknown tokens are treated as revoked
 * (HTTP 200) per RFC 7009 §2.2 to avoid leaking whether a token exists.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = (form.get('token') as string) ?? '';
  const bodyClientId = (form.get('client_id') as string) ?? '';
  const bodyClientSecret = (form.get('client_secret') as string) ?? '';

  const basic = basicAuthCredentials(req.headers.get('authorization'));
  const clientId = basic?.clientId ?? bodyClientId;
  const clientSecret = basic?.clientSecret ?? (bodyClientSecret || undefined);

  if (!token) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'token is required' },
      { status: 400, headers: noStore() }
    );
  }

  const provider = createMcpOAuthProvider();
  const client = clientId ? await provider.getClient(clientId) : null;
  if (!client) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Unknown client_id' },
      { status: 401, headers: { ...noStore(), 'WWW-Authenticate': 'Basic' } }
    );
  }

  try {
    await provider.revokeToken({ token, client, clientSecret });
    return new NextResponse(null, { status: 200, headers: noStore() });
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
