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
};

function isSafeRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
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
