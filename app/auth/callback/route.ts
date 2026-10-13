import { NextRequest, NextResponse } from 'next/server';
import { completeOAuthSignIn } from '@/backend/controllers/auth';

/**
 * Where Supabase returns the browser after Google's consent screen: it is the
 * `redirectTo` the OAuth start builds, and the only place the authorization code
 * is exchanged for a session.
 *
 * The exchange has to happen on the same cookie jar that started the flow —
 * @supabase/ssr keeps the PKCE verifier in a cookie — which is why the Android
 * shell comes back here inside its own WebView rather than finishing in the
 * system browser that showed the consent screen. See NATIVE_OAUTH_CALLBACK_URL.
 *
 * Always 302s: a successful sign-in lands on `next` (a safe path or `/`), a
 * failure on the login page carrying `error=oauth_failed`.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { location } = await completeOAuthSignIn(req.nextUrl.searchParams);
  return NextResponse.redirect(new URL(location, req.nextUrl.origin));
}
