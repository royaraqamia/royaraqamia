import { NextResponse } from 'next/server';
import { McpOAuthError } from './oauth-provider';

/**
 * Shared helpers for the OAuth AS route handlers (RFC 6749 error responses,
 * RFC 7009 revoke responses, CORS headers for metadata discovery).
 */

export function oauthErrorResponse(err: unknown): NextResponse {
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

export function noStore(): Record<string, string> {
  return { 'Cache-Control': 'no-store' };
}

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
    'Access-Control-Expose-Headers': 'WWW-Authenticate',
  };
}

export function optionsResponse(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/** Parse the `Authorization: Basic ...` header into client credentials. */
export function basicAuthCredentials(authorization: string | null): {
  clientId: string;
  clientSecret?: string;
} | null {
  if (!authorization) return null;
  const match = /^Basic\s+(.+)$/i.exec(authorization);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1] ?? '', 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      clientId: decoded.slice(0, separator),
      clientSecret: decoded.slice(separator + 1) || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Build an RFC 6749 §4.1.2.1 error redirect back to the client's redirect_uri.
 * Only call when the redirect_uri is verified to be registered for the client.
 */
export function oauthErrorRedirect(
  redirectUri: string,
  error: string,
  state: string | null,
  description?: string
): NextResponse {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (description) url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return NextResponse.redirect(url.toString(), { headers: noStore() });
}
