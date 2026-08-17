import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createUserProfileRepository } from '@/backend/repositories/users/user-profile-repository';
import { PROTECTED_ROUTES, AUTH_ROUTES } from '@/backend/config/routes';
import { env } from '@/backend/config/env';

function isSafeRedirect(path: string): boolean {
  if (!path) return false;
  try {
    // Decode repeatedly to neutralize double/triple encoding
    let decoded = path;
    let prev: string;
    do {
      prev = decoded;
      decoded = decodeURIComponent(decoded);
    } while (decoded !== prev);

    if (!decoded.startsWith('/')) return false;
    if (decoded.startsWith('//') || decoded.startsWith('\\\\')) return false;
    if (/^(javascript|data|vbscript):/i.test(decoded)) return false;
    return true;
  } catch {
    return false;
  }
}

// @supabase/ssr names its auth session cookie `sb-<ref>-auth-token`, splitting
// oversized (base64url) values into `sb-<ref>-auth-token.0`, `.1`, etc.
const SESSION_COOKIE_NAME_RE = /^sb-[\w-]+-auth-token(?:\.\d+)?$/;
function hasAuthSession(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => SESSION_COOKIE_NAME_RE.test(c.name));
}

function isProtectedRoute(pathname: string): boolean {
  return Object.keys(PROTECTED_ROUTES).some((path) => pathname.startsWith(path));
}

export async function updateSession(request: NextRequest) {
  const hasAuthCode = request.nextUrl.searchParams.has('code');

  // Fast path (dev + prod): a request with no session cookie and no auth code
  // is anonymous. On public pages the remote getSession/getUser calls below
  // would resolve to "no user" anyway (nothing to refresh, no redirect), so
  // skip them to avoid a network round-trip on every page load while
  // development. Protected routes keep their guard; auth-code exchanges keep
  // running regardless of environment.
  if (!hasAuthCode && !hasAuthSession(request) && !isProtectedRoute(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  const pendingCookies: {
    name: string;
    value: string;
    options: CookieOptions;
  }[] = [];

  const supabase = createServerClient(env.supabaseUrl ?? '', env.supabasePublishableKey ?? '', {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          pendingCookies.push({ name, value, options: options ?? {} });
        });
      },
    },
  });

  function applyCookies(response: NextResponse) {
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  }

  // Exchange auth code for session (handles password reset + PKCE flows)
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Ensure public.users record exists for Google OAuth users
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && user.app_metadata?.provider === 'google') {
        await createUserProfileRepository(getAdminSupabase()).upsert({
          id: user.id,
          email: user.email ?? '',
          name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? '',
          avatar_url: user.user_metadata?.avatar_url ?? null,
        });
      }
      // Password-recovery links land here with an auth code — keep the user on
      // the update-password page after the session is exchanged.
      if (request.nextUrl.pathname === '/auth/update-password') {
        return applyCookies(NextResponse.redirect(new URL('/auth/update-password', request.url)));
      }
      const next = request.nextUrl.searchParams.get('next') ?? '/';
      const redirectUrl = isSafeRedirect(next) ? next : '/';
      return applyCookies(NextResponse.redirect(new URL(redirectUrl, request.url)));
    }
  }

  // Refresh session if needed (uses refresh_token cookie). This is a local
  // cookie-parse unless the access token is near expiry, so it stays cheap.
  await supabase.auth.getSession();

  const pathname = request.nextUrl.pathname;
  const needsAuthDecision =
    Object.keys(AUTH_ROUTES).includes(pathname) || isProtectedRoute(pathname);

  // getUser() always hits the Supabase Auth endpoint (a network round-trip),
  // but its result is only ever consulted on auth pages (redirect logged-in
  // users away) and on protected routes (block anonymous users). Skipping it
  // on public pages removes one guaranteed round-trip from every public page
  // load for signed-in users; the browser-side SessionProvider refreshes the
  // session there. The cookie-refresh side effect of getSession() above is
  // preserved for all routes.
  if (needsAuthDecision) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Redirect logged-in users away from auth pages
    for (const [path, redirect] of Object.entries(AUTH_ROUTES)) {
      if (pathname === path && user) {
        return applyCookies(NextResponse.redirect(new URL(redirect, request.url)));
      }
    }

    // Protect authenticated routes
    for (const [path, redirect] of Object.entries(PROTECTED_ROUTES)) {
      if (pathname.startsWith(path) && !user) {
        const url = request.nextUrl.clone();
        url.pathname = redirect;
        if (isSafeRedirect(pathname)) {
          url.searchParams.set('redirect', pathname);
        }
        return applyCookies(NextResponse.redirect(url));
      }
    }
  }

  return applyCookies(NextResponse.next({ request }));
}
