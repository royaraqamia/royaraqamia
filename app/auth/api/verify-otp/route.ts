import { NextResponse } from 'next/server';
import { createClient } from '@/backend/transport/supabase/server';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { createAuthService } from '@/backend/config/auth';
import { createSupabaseAuthGateway } from '@/backend/clients/supabase-auth-gateway';
import type { VerifyOtpResult } from '@/backend/services/auth/auth-service';

async function createService() {
  return createAuthService(createSupabaseAuthGateway(await createClient(), getAdminSupabase()));
}

export async function POST(req: Request) {
  const body = await req.json();
  const email = body.email ?? '';
  const otp = body.otp ?? '';
  const redirectTo = body.redirectTo ?? null;

  const authService = await createService();
  const result: VerifyOtpResult = await authService.verifyOtp({
    email,
    otp,
    redirectTo,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, redirectTo: result.redirectUrl });
}
