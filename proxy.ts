import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const protectedRoutes: Record<string, string> = {
  '/linksnap': '/auth/login',
  '/blogpress': '/auth/login',
  '/habitflow': '/auth/login',
  '/spendtrack': '/auth/login',
  '/admin': '/auth/login',
};

const authRoutes: Record<string, string> = {
  '/auth/login': '/',
  '/auth/signup': '/',
  '/auth/verify-otp': '/',
  '/auth/reset-password': '/',
  '/auth/update-password': '/',
};

function isSafeRedirect(path: string): boolean {
  if (!path) return false;
  try {
    const decoded = decodeURIComponent(path);
    if (!decoded.startsWith('/')) return false;
    if (decoded.startsWith('//') || decoded.startsWith('\\\\')) return false;
    if (/^(javascript|data|vbscript):/i.test(decoded)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

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
        const { createClient } = await import('@supabase/supabase-js');
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );
        await admin
          .from('users')
          .upsert({
            id: user.id,
            email: user.email ?? '',
            name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? '',
            avatar_url: user.user_metadata?.avatar_url ?? null,
            created_at: new Date().toISOString(),
          })
          .maybeSingle();
      }
      const next = request.nextUrl.searchParams.get('next') ?? '/';
      const redirectUrl = isSafeRedirect(next) ? next : '/';
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }
  }

  // Refresh session if needed (uses refresh_token cookie)
  await supabase.auth.getSession();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect logged-in users away from auth pages
  for (const [path, redirect] of Object.entries(authRoutes)) {
    if (request.nextUrl.pathname === path && user) {
      return NextResponse.redirect(new URL(redirect, request.url));
    }
  }

  // Protect authenticated routes
  for (const [path, redirect] of Object.entries(protectedRoutes)) {
    if (request.nextUrl.pathname.startsWith(path) && !user) {
      const url = request.nextUrl.clone();
      url.pathname = redirect;
      const returnPath = request.nextUrl.pathname;
      if (isSafeRedirect(returnPath)) {
        url.searchParams.set('redirect', returnPath);
      }
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
