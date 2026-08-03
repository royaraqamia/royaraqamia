import { NextResponse } from 'next/server';
import { createClient } from '@/backend/transport/supabase/server';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { createAuthService } from '@/backend/config/auth';
import { createSupabaseAuthGateway } from '@/backend/clients/supabase-auth-gateway';
import type { LoginResult } from '@/backend/services/auth/auth-service';

async function createService() {
  return createAuthService(createSupabaseAuthGateway(await createClient(), getAdminSupabase()));
}

export async function POST(req: Request) {
  const body = await req.json();
  const authService = await createService();
  const result: LoginResult = await authService.login({
    email: body.email ?? '',
    password: body.password ?? '',
    redirectTo: body.redirectTo ?? null,
    turnstileToken: body.turnstileToken ?? '',
  });

  if ('needsOtp' in result) {
    return NextResponse.json({ needsOtp: true, redirectUrl: result.redirectUrl });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ redirectUrl: result.redirectUrl });
}
