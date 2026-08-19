import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import { createMcpOAuthProvider } from '@/backend/services/mcp/oauth-provider';
import { encryptSecret } from '@/backend/repositories/mcp/mcp-token-crypto';
import { parseScopes, effectiveScopes } from '@/backend/services/mcp/scope';
import { oauthErrorRedirect } from '@/backend/services/mcp/oauth-http';

export const runtime = 'nodejs';

/**
 * Consent submission for the OAuth flow (RFC 6749 §4.1.2).
 *
 * Reads the user's Supabase session from the browser cookies, encrypts the
 * refresh token so the MCP data-plane can build a user-scoped client later,
 * and issues an authorization code (redirecting to the client's redirect_uri).
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const action = form.get('action');
  const clientId = (form.get('client_id') as string) ?? '';
  const redirectUri = (form.get('redirect_uri') as string) ?? '';
  const scope = (form.get('scope') as string) ?? '';
  const state = (form.get('state') as string) ?? '';
  const codeChallenge = (form.get('code_challenge') as string) ?? '';
  const codeChallengeMethod = (form.get('code_challenge_method') as string) ?? 'S256';

  const provider = createMcpOAuthProvider();
  const client = await provider.getClient(clientId);

  if (!client || !redirectUri || !client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Invalid client_id or redirect_uri' },
      { status: 400 }
    );
  }
  if (client.expires_at && new Date(client.expires_at).getTime() < Date.now()) {
    return oauthErrorRedirect(
      redirectUri,
      'unauthorized_client',
      state,
      'Client registration has expired'
    );
  }
  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return oauthErrorRedirect(
      redirectUri,
      'invalid_request',
      state,
      'code_challenge (S256) is required'
    );
  }

  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user || !session.refresh_token) {
    return oauthErrorRedirect(redirectUri, 'access_denied', state, 'User session is required');
  }

  if (action === 'deny') {
    return oauthErrorRedirect(redirectUri, 'access_denied', state);
  }

  const requested = parseScopes(scope);
  const granted = effectiveScopes(session.user.email ?? null, requested);
  if (granted.length === 0) {
    return oauthErrorRedirect(redirectUri, 'invalid_scope', state, 'No valid scopes requested');
  }

  const sessionEnc = encryptSecret(session.refresh_token);

  try {
    const { code } = await provider.createAuthorizationCode({
      client,
      redirectUri,
      scope: granted,
      codeChallenge,
      codeChallengeMethod,
      userId: session.user.id,
      sessionEnc,
    });
    const url = new URL(redirectUri);
    url.searchParams.set('code', code);
    if (state) url.searchParams.set('state', state);
    return NextResponse.redirect(url.toString());
  } catch {
    return oauthErrorRedirect(redirectUri, 'server_error', state);
  }
}
