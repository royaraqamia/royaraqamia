import { NextResponse } from 'next/server';
import { createClient } from '@/backend/transport/supabase/server';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { createAuthService } from '@/backend/config/auth';
import { createSupabaseAuthGateway } from '@/backend/clients/supabase-auth-gateway';
import type { OAuthResult } from '@/backend/services/auth/auth-service';

async function createService() {
  return createAuthService(createSupabaseAuthGateway(await createClient(), getAdminSupabase()));
}

export async function POST(req: Request) {
  const body = await req.json();
  const authService = await createService();
  const result: OAuthResult = await authService.signInWithOAuth(
    'google',
    body.redirectTo ?? undefined
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ url: result.url });
}
