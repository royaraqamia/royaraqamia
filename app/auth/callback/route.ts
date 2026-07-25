import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const errorParam = searchParams.get('error');

  if (errorParam) {
    Sentry.captureMessage('OAuth callback error', {
      level: 'warning',
      extra: { error: errorParam, origin },
    });
    const errorUrl = new URL('/auth/error', origin);
    errorUrl.searchParams.set('error', errorParam);
    return NextResponse.redirect(errorUrl);
  }

  if (code) {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && user.app_metadata?.provider === 'google') {
        const { createClient: createAdmin } = await import('@supabase/supabase-js');
        const admin = createAdmin(
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
      return NextResponse.redirect(`${origin}${next}`);
    }
    Sentry.captureMessage('OAuth code exchange failed', {
      level: 'warning',
      extra: { error: error?.message, origin },
    });
    return NextResponse.redirect(`${origin}/auth/error`);
  }

  // No code or error — proxy likely handled the exchange already, proceed to destination
  return NextResponse.redirect(`${origin}${next}`);
}
