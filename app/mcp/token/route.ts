import { NextRequest, NextResponse } from 'next/server';
import { createMcpOAuthProvider, McpOAuthError } from '@/backend/services/mcp/oauth-provider';
import { basicAuthCredentials, noStore } from '@/backend/services/mcp/oauth-http';

export const runtime = 'nodejs';

/**
 * OAuth 2.1 token endpoint (RFC 6749 §3.2, §4.1.3, §6).
 *
 * Supports the authorization_code grant (PKCE, S256) and refresh_token grant
 * with rotation. Client authentication via client_secret_basic (Authorization
 * header), client_secret_post (body), or none (public client with PKCE).
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const grantType = (form.get('grant_type') as string) ?? '';
  const bodyClientId = (form.get('client_id') as string) ?? '';
  const bodyClientSecret = (form.get('client_secret') as string) ?? '';

  const basic = basicAuthCredentials(req.headers.get('authorization'));
  const clientId = basic?.clientId ?? bodyClientId;
  const clientSecret = basic?.clientSecret ?? (bodyClientSecret || undefined);

  const provider = createMcpOAuthProvider();
  const client = clientId ? await provider.getClient(clientId) : null;
  if (!client) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Unknown client_id' },
      { status: 401, headers: { ...noStore(), 'WWW-Authenticate': 'Basic' } }
    );
  }
  if (client.expires_at && new Date(client.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Client registration has expired' },
      { status: 401, headers: { ...noStore(), 'WWW-Authenticate': 'Basic' } }
    );
  }

  try {
    if (grantType === 'authorization_code') {
      const code = (form.get('code') as string) ?? '';
      const codeVerifier = (form.get('code_verifier') as string) ?? '';
      const redirectUri = (form.get('redirect_uri') as string) ?? '';
      if (!code || !codeVerifier || !redirectUri) {
        throw new McpOAuthError(
          400,
          'invalid_request',
          'code, code_verifier, and redirect_uri are required'
        );
      }
      const tokens = await provider.exchangeCodeForTokens({
        code,
        codeVerifier,
        client,
        redirectUri,
        clientSecret,
      });
      return NextResponse.json(tokens, { headers: noStore() });
    }

    if (grantType === 'refresh_token') {
      const refreshToken = (form.get('refresh_token') as string) ?? '';
      if (!refreshToken) {
        throw new McpOAuthError(400, 'invalid_request', 'refresh_token is required');
      }
      const tokens = await provider.refreshAccessToken({
        refreshToken,
        client,
        clientSecret,
      });
      return NextResponse.json(tokens, { headers: noStore() });
    }

    throw new McpOAuthError(400, 'unsupported_grant_type', 'Unsupported grant_type');
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
