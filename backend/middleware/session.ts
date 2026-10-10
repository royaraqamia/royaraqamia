import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createUserProfileRepository } from '@/backend/repositories/users/user-profile-repository';
import { PROTECTED_ROUTES, AUTH_ROUTES } from '@/backend/config/routes';
import { env } from '@/backend/config/env';
import { isSafeRedirect } from '@/shared/safe-redirect';

/**
 * Public routes that live under a protected product prefix and must stay
 * reachable without a session (e.g. the password-protected share unlock form
 * at `/linksnap/unlock/:code`, reached via the `/unlock/:code` rewrite).
 */
const PUBLIC_ROUTE_PREFIXES = ['/linksnap/unlock'];

function isProtectedRoute(pathname: string): boolean {
  if (PUBLIC_ROUTE_PREFIXES.some((path) => pathname.startsWith(path))) {
    return false;
  }
  return Object.keys(PROTECTED_ROUTES).some((path) => pathname.startsWith(path));
}

export async function updateSession(request: NextRequest) {
  const hasAuthCode = request.nextUrl.searchParams.has('code');
  const pathname = request.nextUrl.pathname;
  const needsAuthDecision =
    Object.keys(AUTH_ROUTES).includes(pathname) || isProtectedRoute(pathname);

  // Fast path (dev + prod): a request that carries no auth code and lands
  // nowhere this middleware must make an auth decision has nothing to do here.
  //
  // Do NOT build a Supabase client on those routes. The browser-side
  // SessionProvider owns token refresh on them, and the rotating refresh-token
  // cookie allows only one successful refresh per token. A second, eager
  // server-side refresh on every navigation/prefetch races the browser: the
  // loser gets a non-retryable "refresh token already used" error, which
  // either signs the browser out (SIGNED_OUT → the "session expired" redirect)
  // or clears the cookie on the response. Pages that need the user server-side
  // resolve it through the identity module, which refreshes only on demand.
  if (!hasAuthCode && !needsAuthDecision) {
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

  // getUser() both validates the access token against Supabase Auth and, as a
  // side effect, refreshes the session (rotating the refresh-token cookie)
  // when the access token is near expiry. This is the middleware's only
  // refresh, and it runs only where its result is actually consulted:
  // redirecting logged-in users off auth pages, and blocking anonymous users
  // from protected routes. The browser-side SessionProvider owns refresh on
  // every other route.
  if (needsAuthDecision) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Redirect logged-in users away from auth pages
    for (const [path, redirect] of Object.entries(AUTH_ROUTES)) {
      if (pathname === path && user) {
        const requestedRedirect = request.nextUrl.searchParams.get('redirect');
        const isAuthPageTarget = requestedRedirect
          ? Object.keys(AUTH_ROUTES).some((p) => requestedRedirect.startsWith(p))
          : false;
        const target =
          requestedRedirect && isSafeRedirect(requestedRedirect) && !isAuthPageTarget
            ? requestedRedirect
            : redirect;
        return applyCookies(NextResponse.redirect(new URL(target, request.url)));
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
