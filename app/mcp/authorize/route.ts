import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import { createMcpOAuthProvider } from '@/backend/services/mcp/oauth-provider';
import { oauthErrorRedirect, noStore } from '@/backend/services/mcp/oauth-http';

export const runtime = 'nodejs';

/**
 * OAuth 2.1 authorization endpoint (RFC 6749 §4.1.1).
 *
 * Validates the authorization request, requires the browser user to be signed
 * in, and forwards to the consent page (`/mcp/connect`) with the original
 * params preserved. The consent page handles approve/deny.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const responseType = params.get('response_type');
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const state = params.get('state');
  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method');

  if (responseType !== 'code') {
    if (redirectUri) {
      return oauthErrorRedirect(redirectUri, 'unsupported_response_type', state);
    }
    return NextResponse.json(
      { error: 'unsupported_response_type', error_description: 'response_type must be "code"' },
      { status: 400, headers: noStore() }
    );
  }

  const provider = createMcpOAuthProvider();
  const client = clientId ? await provider.getClient(clientId) : null;

  if (!client) {
    return NextResponse.json(
      { error: 'unauthorized_client', error_description: 'Unknown client_id' },
      { status: 401, headers: noStore() }
    );
  }
  if (client.expires_at && new Date(client.expires_at).getTime() < Date.now()) {
    if (redirectUri) {
      return oauthErrorRedirect(
        redirectUri,
        'unauthorized_client',
        state,
        'Client registration has expired'
      );
    }
    return NextResponse.json(
      { error: 'unauthorized_client', error_description: 'Client registration has expired' },
      { status: 401, headers: noStore() }
    );
  }
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        error_description: 'redirect_uri is not registered for this client',
      },
      { status: 400, headers: noStore() }
    );
  }

  // OAuth 2.1: PKCE (S256) is mandatory.
  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return oauthErrorRedirect(
      redirectUri,
      'invalid_request',
      state,
      'code_challenge (S256) is required'
    );
  }

  // Browser user must be signed in before consent is shown.
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    const loginUrl = new URL('/auth/login', req.url);
    loginUrl.searchParams.set('redirect', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl, { headers: noStore() });
  }

  // Forward to the consent page with the full original query preserved.
  const consentUrl = new URL('/mcp/connect', req.url);
  consentUrl.search = params.toString();
  return NextResponse.redirect(consentUrl, { headers: noStore() });
}
